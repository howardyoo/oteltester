/**
 * MCP (Model Context Protocol) Server Implementation
 * 
 * This module implements the MCP protocol to expose oteltester functionality
 * to AI agents. It handles JSON-RPC requests and provides tools for managing
 * otel collector, refinery, configurations, and testing.
 */

import { get_config, save_config } from "./config.js";
import { get_pids, check_pid, get_type, save_yaml, read_yaml, save_json, read_json } from "./utils.js";
import { install_otelcol, install_refinery, get_otelcol_versions, get_refinery_versions } from "./install.js";
import { spawn, exec } from "child_process";
import { readdirSync, unlinkSync } from "fs";
import Ajv from "ajv";
import fs from "fs";

// Task storage for async operations
const tasks = new Map();
let taskCounter = 0;

// Output buffers for async operations
const outputBuffers = new Map();

// OTEL schema validator init.
const schema = JSON.parse(fs.readFileSync("./backend/schema/otel-schema.json", "utf8"));
const ajv = new Ajv({ allErrors: true});
const validate = ajv.compile(schema);

function validate_otel_json(json) {
  const valid = validate(json);
  if(!valid) {
    return { valid: false, errors: validate.errors };
  }
  return { valid: true };
}

// WebSocket references (will be set from server.js)
let otelcol_out_ws = null;
let refinery_out_ws = null;
let otelcol_stdout_ws = null;
let refinery_stdout_ws = null;
let otelcol_setup_ws = null;
let refinery_setup_ws = null;

export function setWebSocketRefs(refs) {
  otelcol_out_ws = refs.otelcol_out_ws;
  refinery_out_ws = refs.refinery_out_ws;
  otelcol_stdout_ws = refs.otelcol_stdout_ws;
  refinery_stdout_ws = refs.refinery_stdout_ws;
  otelcol_setup_ws = refs.otelcol_setup_ws;
  refinery_setup_ws = refs.refinery_setup_ws;
  
  // Set up WebSocket message handlers to capture output for tasks
  setupWebSocketHandlers();
}

function setupWebSocketHandlers() {
  // Store original send methods
  const originalOtelcolSend = otelcol_out_ws?.send;
  const originalRefinerySend = refinery_out_ws?.send;
  
  // We'll need to intercept messages at the server level
  // For now, tasks will collect output from process stdout/stderr
}

// Function to capture output for a task
export function captureOutputForTask(taskId, type, data) {
  const task = tasks.get(taskId);
  if (task && (task.type === 'get_otelcol_output' || task.type === 'get_refinery_output')) {
    updateTask(taskId, {
      output: [...(task.output || []), {
        timestamp: new Date().toISOString(),
        type,
        data: data.toString()
      }]
    });
  }
}

// Get active output collection tasks
export function getActiveOutputTasks(type) {
  const activeTasks = [];
  for (const [taskId, task] of tasks.entries()) {
    if (task.status === 'running' && 
        ((type === 'otelcol' && task.type === 'get_otelcol_output') ||
         (type === 'refinery' && task.type === 'get_refinery_output'))) {
      activeTasks.push(taskId);
    }
  }
  return activeTasks;
}

/**
 * Create a new async task and return its handle
 */
function createTask(type, initialData = {}) {
  const taskId = `task_${++taskCounter}_${Date.now()}`;
  const task = {
    id: taskId,
    type,
    status: 'running',
    createdAt: new Date().toISOString(),
    data: initialData,
    output: [],
    error: null
  };
  tasks.set(taskId, task);
  
  // Clean up old tasks after 1 hour
  setTimeout(() => {
    tasks.delete(taskId);
  }, 3600000);
  
  return taskId;
}

/**
 * Update task status
 */
function updateTask(taskId, updates) {
  const task = tasks.get(taskId);
  if (task) {
    Object.assign(task, updates);
    tasks.set(taskId, task);
  }
}

/**
 * Get task status
 */
function getTask(taskId) {
  return tasks.get(taskId);
}

/**
 * MCP Protocol Handlers
 */

export function handleMCPRequest(req, res) {
  const { jsonrpc, id, method, params } = req.body;

  if (jsonrpc !== '2.0') {
    return res.status(400).json({
      jsonrpc: '2.0',
      id,
      error: { code: -32600, message: 'Invalid Request' }
    });
  }

  // Handle different MCP methods
  switch (method) {
    case 'initialize':
      handleInitialize(id, params, res);
      break;
    case 'tools/list':
      handleToolsList(id, res);
      break;
    case 'tools/call':
      handleToolsCall(id, params, res);
      break;
    case 'tasks/get':
      handleTaskGet(id, params, res);
      break;
    default:
      res.json({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` }
      });
  }
}

function handleInitialize(id, params, res) {
  res.json({
    jsonrpc: '2.0',
    id,
    result: {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {
          listChanged: true
        }
      },
      serverInfo: {
        name: 'oteltester-mcp',
        version: '1.0.0'
      }
    }
  });
}

function handleToolsList(id, res) {
  res.json({
    jsonrpc: '2.0',
    id,
    result: {
      tools: getToolDefinitions()
    }
  });
}

async function handleToolsCall(id, params, res) {
  const { name, arguments: args } = params;

  try {
    const result = await executeTool(name, args);
    res.json({
      jsonrpc: '2.0',
      id,
      result
    });
  } catch (error) {
    res.json({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32000,
        message: error.message || 'Tool execution failed',
        data: error.stack
      }
    });
  }
}

function handleTaskGet(id, params, res) {
  const { taskId } = params;
  const task = getTask(taskId);
  
  if (!task) {
    return res.json({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32001,
        message: `Task not found: ${taskId}`
      }
    });
  }

  res.json({
    jsonrpc: '2.0',
    id,
    result: task
  });
}

/**
 * Tool Definitions
 */
function getToolDefinitions() {
  return [
    // Configuration tools
    {
      name: 'get_config',
      description: 'Get the current oteltester configuration',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'save_config',
      description: 'Save the oteltester configuration',
      inputSchema: {
        type: 'object',
        properties: {
          config: {
            type: 'object',
            description: 'Configuration object to save'
          }
        },
        required: ['config']
      }
    },
    
    // Installation tools
    {
      name: 'get_otelcol_versions',
      description: 'Get available OpenTelemetry Collector versions',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'get_refinery_versions',
      description: 'Get available Refinery versions',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'get_otelcol_version',
      description: 'Get the currently installed OpenTelemetry Collector version',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'get_refinery_version',
      description: 'Get the currently installed Refinery version',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'install_otelcol',
      description: 'Install OpenTelemetry Collector (async operation)',
      inputSchema: {
        type: 'object',
        properties: {
          version: {
            type: 'string',
            description: 'Version to install (e.g., "0.118.0")'
          }
        },
        required: ['version']
      }
    },
    {
      name: 'install_refinery',
      description: 'Install Refinery (async operation)',
      inputSchema: {
        type: 'object',
        properties: {
          version: {
            type: 'string',
            description: 'Version to install (e.g., "1.20.0")'
          }
        },
        required: ['version']
      }
    },
    
    // Process management tools
    {
      name: 'get_pids',
      description: 'Get list of running otelcol and refinery processes',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'start_otelcol',
      description: 'Start the OpenTelemetry Collector process (async output)',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'start_refinery',
      description: 'Start the Refinery process (async output)',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'stop_process',
      description: 'Stop a process by PID',
      inputSchema: {
        type: 'object',
        properties: {
          pid: {
            type: 'string',
            description: 'Process ID to stop'
          }
        },
        required: ['pid']
      }
    },
    {
      name: 'refresh_process',
      description: 'Refresh/reload configuration for a process by PID',
      inputSchema: {
        type: 'object',
        properties: {
          pid: {
            type: 'string',
            description: 'Process ID to refresh'
          }
        },
        required: ['pid']
      }
    },
    
    // Configuration file tools
    {
      name: 'get_yaml',
      description: 'Read a YAML file',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the YAML file'
          }
        },
        required: ['path']
      }
    },
    {
      name: 'save_yaml',
      description: 'Save content to a YAML file',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to save the YAML file'
          },
          content: {
            type: 'string',
            description: 'YAML content to save'
          }
        },
        required: ['path', 'content']
      }
    },
    {
      name: 'get_json',
      description: 'Read a JSON file',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the JSON file'
          }
        },
        required: ['path']
      }
    },
    {
      name: 'save_json',
      description: 'Save content to a JSON file',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to save the JSON file'
          },
          content: {
            type: 'object',
            description: 'JSON object to save'
          }
        },
        required: ['path', 'content']
      }
    },
    
    // Saved JSON management
    {
      name: 'list_saved_json',
      description: 'List all saved JSON files',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'get_saved_json',
      description: 'Get a saved JSON file by name',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name of the saved JSON file (without .json extension)'
          }
        },
        required: ['name']
      }
    },
    {
      name: 'save_saved_json',
      description: 'Save JSON data to the saved directory',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name for the saved JSON file (without .json extension)'
          },
          data: {
            type: 'object',
            description: 'JSON data to save'
          }
        },
        required: ['name', 'data']
      }
    },
    {
      name: 'delete_saved_json',
      description: 'Delete a saved JSON file',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name of the saved JSON file to delete (without .json extension)'
          }
        },
        required: ['name']
      }
    },
    
    // Testing tools
    {
      name: 'send_otel_json',
      description: 'Send OTEL JSON data to an endpoint (async operation)',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'Endpoint URL to send data to'
          },
          json: {
            type: 'object',
            description: 'OTEL JSON data to send'
          },
          headers: {
            type: 'object',
            description: 'Optional HTTP headers'
          }
        },
        required: ['url', 'json']
      }
    },
    
    // Output monitoring tools (async)
    {
      name: 'get_otelcol_output',
      description: 'Get OpenTelemetry Collector output (creates async task)',
      inputSchema: {
        type: 'object',
        properties: {
          duration: {
            type: 'number',
            description: 'Duration in seconds to collect output (default: 30)'
          }
        }
      }
    },
    {
      name: 'get_refinery_output',
      description: 'Get Refinery output (creates async task)',
      inputSchema: {
        type: 'object',
        properties: {
          duration: {
            type: 'number',
            description: 'Duration in seconds to collect output (default: 30)'
          }
        }
      }
    },
    
    // Module information
    {
      name: 'get_otelcol_modules',
      description: 'Get available OpenTelemetry Collector modules',
      inputSchema: {
        type: 'object',
        properties: {
          version: {
            type: 'string',
            description: 'Optional version to get modules for'
          }
        }
      }
    }
  ];
}

/**
 * Execute a tool by name
 */
async function executeTool(name, args) {
  switch (name) {
    case 'get_config':
      return { config: get_config() };
    
    case 'save_config':
      save_config(args.config);
      return { message: 'Configuration saved successfully' };
    
    case 'get_otelcol_versions':
      const otelcolVersions = await get_otelcol_versions();
      return { versions: otelcolVersions };
    
    case 'get_refinery_versions':
      const refineryVersions = await get_refinery_versions();
      return { versions: refineryVersions };
    
    case 'get_otelcol_version':
      return await getOtelcolVersion();
    
    case 'get_refinery_version':
      return await getRefineryVersion();
    
    case 'install_otelcol':
      return await installOtelcol(args.version);
    
    case 'install_refinery':
      return await installRefinery(args.version);
    
    case 'get_pids':
      return { pids: get_pids() };
    
    case 'start_otelcol':
      return await startOtelcol();
    
    case 'start_refinery':
      return await startRefinery();
    
    case 'stop_process':
      return await stopProcess(args.pid);
    
    case 'refresh_process':
      return await refreshProcess(args.pid);
    
    case 'get_yaml':
      return { content: read_yaml(args.path) };
    
    case 'save_yaml':
      save_yaml(args.path, args.content);
      return { message: 'YAML saved successfully' };
    
    case 'get_json':
      return { content: read_json(args.path) };
    
    case 'save_json':
      save_json(args.path, args.content);
      return { message: 'JSON saved successfully' };
    
    case 'list_saved_json':
      return await listSavedJson();
    
    case 'get_saved_json':
      return await getSavedJson(args.name);
    
    case 'save_saved_json':
      return await saveSavedJson(args.name, args.data);
    
    case 'delete_saved_json':
      return await deleteSavedJson(args.name);
    
    case 'send_otel_json':
      return await sendOtelJson(args.url, args.json, args.headers || {});
    
    case 'get_otelcol_output':
      return await getOtelcolOutput(args.duration || 30);
    
    case 'get_refinery_output':
      return await getRefineryOutput(args.duration || 30);
    
    case 'get_otelcol_modules':
      return await getOtelcolModules(args.version);
    
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * Tool implementations
 */

async function getOtelcolVersion() {
  return new Promise((resolve, reject) => {
    const config = get_config();
    const command_line = config.otel_collector.bin_path + " --version";
    const [command, ...args] = command_line.split(" ");
    const childProcess = spawn(command, args);
    
    let output = '';
    childProcess.stdout.on("data", (data) => {
      output += data.toString();
    });
    
    childProcess.on("close", (code) => {
      if (code === 0) {
        resolve({ version: output.trim() });
      } else {
        reject(new Error(`Failed to get version, exit code: ${code}`));
      }
    });
    
    childProcess.on("error", (err) => {
      reject(err);
    });
  });
}

async function getRefineryVersion() {
  return new Promise((resolve, reject) => {
    const config = get_config();
    const command_line = config.refinery.bin_path + " --version";
    const [command, ...args] = command_line.split(" ");
    const childProcess = spawn(command, args);
    
    let output = '';
    childProcess.stdout.on("data", (data) => {
      output += data.toString();
    });
    
    childProcess.on("close", (code) => {
      if (code === 0) {
        resolve({ version: output.trim() });
      } else {
        reject(new Error(`Failed to get version, exit code: ${code}`));
      }
    });
    
    childProcess.on("error", (err) => {
      reject(err);
    });
  });
}

async function installOtelcol(version) {
  const taskId = createTask('install_otelcol', { version });
  
  // Create a mock WebSocket-like object for installation progress
  const mockWs = {
    send: (data) => {
      const message = typeof data === 'string' ? JSON.parse(data) : data;
      updateTask(taskId, {
        output: [...(tasks.get(taskId).output || []), message]
      });
    },
    on: () => {}
  };
  
  // Start installation in background
  install_otelcol(mockWs, version).catch(err => {
    updateTask(taskId, {
      status: 'failed',
      error: err.message
    });
  });
  
  return {
    taskId,
    message: 'Installation started',
    taskUri: `/mcp/tasks/${taskId}`
  };
}

async function installRefinery(version) {
  const taskId = createTask('install_refinery', { version });
  
  // Create a mock WebSocket-like object for installation progress
  const mockWs = {
    send: (data) => {
      const message = typeof data === 'string' ? JSON.parse(data) : data;
      updateTask(taskId, {
        output: [...(tasks.get(taskId).output || []), message]
      });
    },
    on: () => {}
  };
  
  // Start installation in background
  install_refinery(mockWs, version).catch(err => {
    updateTask(taskId, {
      status: 'failed',
      error: err.message
    });
  });
  
  return {
    taskId,
    message: 'Installation started',
    taskUri: `/mcp/tasks/${taskId}`
  };
}

async function startOtelcol() {
  const config = get_config();
  const otelcollector = config.otel_collector;
  const command_line = otelcollector.bin_path + " --config=file:" + otelcollector.config_path;
  const [command, ...args] = command_line.split(" ");
  
  const taskId = createTask('start_otelcol', { pid: null });
  
  try {
    const childProcess = spawn(command, args);
    const pid = childProcess.pid;
    
    updateTask(taskId, {
      data: { pid },
      status: 'running'
    });
    
    // Capture stdout/stderr
    childProcess.stdout.on("data", (data) => {
      const output = data.toString();
      if (otelcol_stdout_ws) {
        otelcol_stdout_ws.send(output);
      }
      updateTask(taskId, {
        output: [...(tasks.get(taskId).output || []), { type: 'stdout', data: output }]
      });
    });
    
    childProcess.stderr.on("data", (data) => {
      const output = data.toString();
      if (otelcol_stdout_ws) {
        otelcol_stdout_ws.send(output);
      }
      updateTask(taskId, {
        output: [...(tasks.get(taskId).output || []), { type: 'stderr', data: output }]
      });
    });
    
    childProcess.on("close", (code) => {
      updateTask(taskId, {
        status: 'completed',
        data: { ...tasks.get(taskId).data, exitCode: code }
      });
      if (otelcol_stdout_ws) {
        otelcol_stdout_ws.send("[EXIT] otelcol exited with code " + code + "\n");
      }
    });
    
    childProcess.on("error", (err) => {
      updateTask(taskId, {
        status: 'failed',
        error: err.toString()
      });
      if (otelcol_stdout_ws) {
        otelcol_stdout_ws.send("[ERROR] " + err.toString() + "\n");
      }
    });
    
    return {
      taskId,
      pid,
      message: "otelcol started successfully",
      taskUri: `/mcp/tasks/${taskId}`
    };
  } catch (err) {
    updateTask(taskId, {
      status: 'failed',
      error: err.toString()
    });
    throw err;
  }
}

async function startRefinery() {
  const config = get_config();
  const refinery = config.refinery;
  const command_line = refinery.bin_path + " --config=" + refinery.config_path + " --rules_config=" + refinery.rule_path + " -d";
  const [command, ...args] = command_line.split(" ");
  
  const taskId = createTask('start_refinery', { pid: null });
  
  try {
    const childProcess = spawn(command, args);
    const pid = childProcess.pid;
    
    updateTask(taskId, {
      data: { pid },
      status: 'running'
    });
    
    // Capture stdout/stderr
    childProcess.stdout.on("data", (data) => {
      const output = data.toString();
      if (refinery_stdout_ws) {
        refinery_stdout_ws.send(output);
      }
      updateTask(taskId, {
        output: [...(tasks.get(taskId).output || []), { type: 'stdout', data: output }]
      });
    });
    
    childProcess.stderr.on("data", (data) => {
      const output = data.toString();
      if (refinery_stdout_ws) {
        refinery_stdout_ws.send(output);
      }
      updateTask(taskId, {
        output: [...(tasks.get(taskId).output || []), { type: 'stderr', data: output }]
      });
    });
    
    childProcess.on("close", (code) => {
      updateTask(taskId, {
        status: 'completed',
        data: { ...tasks.get(taskId).data, exitCode: code }
      });
      if (refinery_stdout_ws) {
        refinery_stdout_ws.send("[EXIT] refinery exited with code " + code);
      }
    });
    
    childProcess.on("error", (err) => {
      updateTask(taskId, {
        status: 'failed',
        error: err.toString()
      });
      if (refinery_stdout_ws) {
        refinery_stdout_ws.send("[ERROR] " + err.toString());
      }
    });
    
    return {
      taskId,
      pid,
      message: "refinery started successfully",
      taskUri: `/mcp/tasks/${taskId}`
    };
  } catch (err) {
    updateTask(taskId, {
      status: 'failed',
      error: err.toString()
    });
    throw err;
  }
}

async function stopProcess(pid) {
  if (!pid || !check_pid(pid)) {
    throw new Error("No valid pid provided");
  }
  
  return new Promise((resolve, reject) => {
    const type = get_type(pid);
    let signal = 'TERM';
    
    if (type === "otelcol") {
      signal = 'TERM';
    } else if (type === "refinery") {
      signal = 'HUP';
    } else {
      return reject(new Error("invalid type of the process"));
    }
    
    exec(`kill -${signal} ${pid}`, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`Failed to stop process with pid ${pid}: ${err.message}`));
      } else {
        resolve({ message: "stop signal sent successfully", status: "success" });
      }
    });
  });
}

async function refreshProcess(pid) {
  if (!pid || !check_pid(pid)) {
    throw new Error("No valid pid provided");
  }
  
  return new Promise((resolve, reject) => {
    const type = get_type(pid);
    let signal = 'HUP';
    
    if (type === "otelcol") {
      signal = 'HUP';
    } else if (type === "refinery") {
      signal = 'USR1';
    } else {
      return reject(new Error("invalid type of the process"));
    }
    
    exec(`kill -${signal} ${pid}`, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`Failed to refresh process with pid ${pid}: ${err.message}`));
      } else {
        resolve({ message: "refresh signal sent successfully" });
      }
    });
  });
}

async function listSavedJson() {
  const config = get_config();
  const files = readdirSync(config.work_dir + "/saved");
  const json_files = files.filter(file => file.endsWith(".json"));
  const names = json_files.map(file => file.replace(".json", ""));
  return { files: names };
}

async function getSavedJson(name) {
  const config = get_config();
  const file = name.replace("..", "");
  const json = read_json(config.work_dir + "/saved/" + file + ".json");
  if (!json) {
    throw new Error(`Failed to read saved JSON: ${name}`);
  }
  return { data: json };
}

async function saveSavedJson(name, data) {
  const config = get_config();
  const file = name.replace("..", "").replace(/\s+/g, '_').trim();
  save_json(config.work_dir + "/saved/" + file + ".json", data);
  return { message: "JSON data saved successfully" };
}

async function deleteSavedJson(name) {
  const config = get_config();
  const file = name.replace("..", "");
  unlinkSync(config.work_dir + "/saved/" + file + ".json");
  return { message: "JSON data deleted successfully" };
}

async function sendOtelJson(url, json, headers) {
  const taskId = createTask('send_otel_json', { url });
  
  try {
    const result = await sendOtelJsonInternal(url, json, headers);
    updateTask(taskId, {
      status: 'completed',
      data: result
    });
    return {
      taskId,
      ...result,
      taskUri: `/mcp/tasks/${taskId}`
    };
  } catch (err) {
    updateTask(taskId, {
      status: 'failed',
      error: err.message
    });
    throw err;
  }
}

async function sendOtelJsonInternal(url, json, headers) {
  let total = 0;
  let processed = 0;
  const results = [];
  
  if (json.resourceSpans) total++;
  if (json.resourceMetrics) total++;
  if (json.resourceLogs) total++;
  
  if (total === 0) {
    return { result: [{ error: true, message: "No resourceSpans, resourceMetrics, or resourceLogs found" }], total: 0, processed: 0 };
  }
  
  // Send resourceSpans
  if (json.resourceSpans) {
    const _json = { resourceSpans: json.resourceSpans };
    let url_to_use = url;
    if (!url.endsWith('/v1/traces')) {
      url_to_use += '/v1/traces';
    }
    
    const validation = validate_otel_json(_json);
    const _result = { validation: validation.valid };
    
    if (validation.valid) {
      try {
        const response = await fetch(url_to_use, {
          method: 'POST',
          body: JSON.stringify(_json),
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
        
        if (response.status === 200) {
          processed++;
          _result.error = false;
          _result.sent = true;
          _result.message = "Traces sent successfully";
        } else {
          _result.error = true;
          _result.sent = false;
          _result.message = "Failed to send traces";
          _result.error_message = response.statusText;
        }
      } catch (err) {
        _result.sent = false;
        _result.error = true;
        _result.message = "Failed to send traces";
        _result.error_message = err.toString();
      }
    } else {
      _result.validation = false;
      _result.sent = false;
      _result.error = true;
      _result.message = "Invalid OTEL JSON";
      _result.errors = validation.errors;
    }
    results.push(_result);
  }
  
  // Send resourceMetrics
  if (json.resourceMetrics) {
    const _json = { resourceMetrics: json.resourceMetrics };
    let url_to_use = url;
    if (!url.endsWith('/v1/metrics')) {
      url_to_use += '/v1/metrics';
    }
    
    const validation = validate_otel_json(_json);
    const _result = { validation: validation.valid };
    
    if (validation.valid) {
      try {
        const response = await fetch(url_to_use, {
          method: 'POST',
          body: JSON.stringify(_json),
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
        
        if (response.status === 200) {
          processed++;
          _result.error = false;
          _result.sent = true;
          _result.message = "Metrics sent successfully";
        } else {
          _result.error = true;
          _result.sent = false;
          _result.message = "Failed to send metrics";
          _result.error_message = response.statusText;
        }
      } catch (err) {
        _result.sent = false;
        _result.error = true;
        _result.message = "Failed to send metrics";
        _result.error_message = err.toString();
      }
    } else {
      _result.validation = false;
      _result.sent = false;
      _result.error = true;
      _result.message = "Invalid OTEL JSON";
      _result.errors = validation.errors;
    }
    results.push(_result);
  }
  
  // Send resourceLogs
  if (json.resourceLogs) {
    const _json = { resourceLogs: json.resourceLogs };
    let url_to_use = url;
    if (!url.endsWith('/v1/logs')) {
      url_to_use += '/v1/logs';
    }
    
    const validation = validate_otel_json(_json);
    const _result = { validation: validation.valid };
    
    if (validation.valid) {
      try {
        const response = await fetch(url_to_use, {
          method: 'POST',
          body: JSON.stringify(_json),
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
        
        if (response.status === 200) {
          processed++;
          _result.error = false;
          _result.sent = true;
          _result.message = "Logs sent successfully";
        } else {
          _result.error = true;
          _result.sent = false;
          _result.message = "Failed to send logs";
          _result.error_message = response.statusText;
        }
      } catch (err) {
        _result.sent = false;
        _result.error = true;
        _result.message = "Failed to send logs";
        _result.error_message = err.toString();
      }
    } else {
      _result.validation = false;
      _result.sent = false;
      _result.error = true;
      _result.message = "Invalid OTEL JSON";
      _result.errors = validation.errors;
    }
    results.push(_result);
  }
  
  return { result: results, total, processed };
}

async function getOtelcolOutput(duration) {
  const taskId = createTask('get_otelcol_output', { duration });
  
  // Set up output buffer
  const buffer = [];
  const startTime = Date.now();
  
  // Create a message handler that captures output
  const messageHandler = (data) => {
    const output = {
      timestamp: new Date().toISOString(),
      data: data.toString()
    };
    buffer.push(output);
    updateTask(taskId, {
      output: [...buffer],
      data: { collectedOutputs: buffer.length, duration: (Date.now() - startTime) / 1000 }
    });
  };
  
  // Store buffer reference for cleanup
  outputBuffers.set(taskId, {
    type: 'otelcol',
    handler: messageHandler,
    buffer
  });
  
  // Auto-complete after duration
  setTimeout(() => {
    updateTask(taskId, {
      status: 'completed',
      data: { 
        collectedOutputs: buffer.length,
        duration: (Date.now() - startTime) / 1000
      }
    });
    outputBuffers.delete(taskId);
  }, duration * 1000);
  
  return {
    taskId,
    message: `Collecting otelcol output for ${duration} seconds`,
    taskUri: `/mcp/tasks/${taskId}`,
    note: 'Output will be collected from otelcol stdout/stderr and OTLP output. Poll the task URI to get updates.'
  };
}

async function getRefineryOutput(duration) {
  const taskId = createTask('get_refinery_output', { duration });
  
  // Set up output buffer
  const buffer = [];
  const startTime = Date.now();
  
  // Create a message handler that captures output
  const messageHandler = (data) => {
    const output = {
      timestamp: new Date().toISOString(),
      data: data.toString()
    };
    buffer.push(output);
    updateTask(taskId, {
      output: [...buffer],
      data: { collectedOutputs: buffer.length, duration: (Date.now() - startTime) / 1000 }
    });
  };
  
  // Store buffer reference for cleanup
  outputBuffers.set(taskId, {
    type: 'refinery',
    handler: messageHandler,
    buffer
  });
  
  // Auto-complete after duration
  setTimeout(() => {
    updateTask(taskId, {
      status: 'completed',
      data: { 
        collectedOutputs: buffer.length,
        duration: (Date.now() - startTime) / 1000
      }
    });
    outputBuffers.delete(taskId);
  }, duration * 1000);
  
  return {
    taskId,
    message: `Collecting refinery output for ${duration} seconds`,
    taskUri: `/mcp/tasks/${taskId}`,
    note: 'Output will be collected from refinery stdout/stderr and batch output. Poll the task URI to get updates.'
  };
}

async function getOtelcolModules(version) {
  const versionPath = version ? `tags/v${version}` : "heads/main";
  const url = `https://raw.githubusercontent.com/open-telemetry/opentelemetry-collector-contrib/refs/${versionPath}/versions.yaml`;
  
  const { read_yaml_from_url } = await import('./utils.js');
  const yaml = await read_yaml_from_url(url);
  
  const module_list = yaml['module-sets']['contrib-base']['modules'];
  const response = {};
  response['version'] = yaml['module-sets']['contrib-base']['version'];
  
  for (const module of module_list) {
    const module_name_array = module.split('/');
    if (module_name_array.length === 5) {
      if (!response[module_name_array[3]]) {
        response[module_name_array[3]] = [];
      }
      response[module_name_array[3]].push(module_name_array[4]);
    }
  }
  
  return { modules: response };
}
