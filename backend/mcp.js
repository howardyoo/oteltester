/**
 * MCP (Model Context Protocol) Server Implementation
 * 
 * This module implements the MCP protocol to expose oteltester functionality
 * to AI agents. It handles JSON-RPC requests and provides tools for managing
 * otel collector, refinery, configurations, and testing.
 */

import { get_config, save_config } from "./config.js";
import { get_pids, check_pid, get_type, save_yaml, read_yaml, save_json, read_json, yaml_to_json } from "./utils.js";
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
let mcp_activity_ws = null;
let getMcpActivityWs = null;

// Output buffer accessor functions (will be set from server.js)
let getLatestOtelcolOutputs = null;
let getLatestRefineryOutputs = null;
let clearOtelcolOutputBuffer = null;
let clearRefineryOutputBuffer = null;

// Console output buffer accessor functions (will be set from server.js)
let getOtelcolConsoleOutput = null;
let getOtelcolConsoleOutputPaginated = null;
let getRefineryConsoleOutput = null;
let getRefineryConsoleOutputPaginated = null;
let clearOtelcolConsoleBuffer = null;
let clearRefineryConsoleBuffer = null;
let searchConsoleOutput = null;

// Console output store functions (will be set from server.js)
let storeOtelcolConsoleOutput = null;
let storeRefineryConsoleOutput = null;

export function setWebSocketRefs(refs) {
  otelcol_out_ws = refs.otelcol_out_ws;
  refinery_out_ws = refs.refinery_out_ws;
  otelcol_stdout_ws = refs.otelcol_stdout_ws;
  refinery_stdout_ws = refs.refinery_stdout_ws;
  otelcol_setup_ws = refs.otelcol_setup_ws;
  refinery_setup_ws = refs.refinery_setup_ws;
  mcp_activity_ws = refs.mcp_activity_ws;
  getMcpActivityWs = refs.getMcpActivityWs;
  
  // Output buffer accessor functions
  getLatestOtelcolOutputs = refs.getLatestOtelcolOutputs;
  getLatestRefineryOutputs = refs.getLatestRefineryOutputs;
  clearOtelcolOutputBuffer = refs.clearOtelcolOutputBuffer;
  clearRefineryOutputBuffer = refs.clearRefineryOutputBuffer;
  
  // Console output buffer accessor functions
  getOtelcolConsoleOutput = refs.getOtelcolConsoleOutput;
  getOtelcolConsoleOutputPaginated = refs.getOtelcolConsoleOutputPaginated;
  getRefineryConsoleOutput = refs.getRefineryConsoleOutput;
  getRefineryConsoleOutputPaginated = refs.getRefineryConsoleOutputPaginated;
  clearOtelcolConsoleBuffer = refs.clearOtelcolConsoleBuffer;
  clearRefineryConsoleBuffer = refs.clearRefineryConsoleBuffer;
  searchConsoleOutput = refs.searchConsoleOutput;
  
  // Console output store functions
  storeOtelcolConsoleOutput = refs.storeOtelcolConsoleOutput;
  storeRefineryConsoleOutput = refs.storeRefineryConsoleOutput;
  
  // Set up WebSocket message handlers to capture output for tasks
  setupWebSocketHandlers();
}

/**
 * Broadcast MCP activity to the UI via WebSocket
 * @param {string} action - The action type (e.g., 'config_changed', 'otel_data_submitted', etc.)
 * @param {object} data - The data associated with the action
 */
function broadcastMcpActivity(action, data) {
  // Use the getter function to get the current WebSocket reference
  const ws = getMcpActivityWs ? getMcpActivityWs() : mcp_activity_ws;
  if (ws && ws.readyState === 1) { // 1 = OPEN
    try {
      ws.send(JSON.stringify({
        type: 'mcp_activity',
        action,
        data,
        timestamp: new Date().toISOString()
      }));
    } catch (err) {
      console.error('Error broadcasting MCP activity:', err.message);
    }
  }
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
    case 'resources/list':
      handleResourcesList(id, res);
      break;
    case 'resources/read':
      handleResourcesRead(id, params, res);
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
        },
        resources: {
          subscribe: false,
          listChanged: false
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
    },
    
    // Output retrieval and forwarding tools
    {
      name: 'get_latest_otelcol_output',
      description: 'Get the latest output received from the OTEL Collector (traces, metrics, logs). This is the data shown in the Otelcol Result section of the UI.',
      inputSchema: {
        type: 'object',
        properties: {
          count: {
            type: 'number',
            description: 'Number of latest outputs to retrieve (default: 10, max: 50)'
          }
        }
      }
    },
    {
      name: 'get_latest_refinery_output',
      description: 'Get the latest output received from Refinery (traces, metrics, logs). This is the data shown in the Refinery Result section of the UI.',
      inputSchema: {
        type: 'object',
        properties: {
          count: {
            type: 'number',
            description: 'Number of latest outputs to retrieve (default: 10, max: 50)'
          }
        }
      }
    },
    {
      name: 'forward_otelcol_output_to_refinery',
      description: 'Forward the latest OTEL Collector output to the local Refinery. This allows testing the refinery sampling rules with data that was received by the collector.',
      inputSchema: {
        type: 'object',
        properties: {
          outputIndex: {
            type: 'number',
            description: 'Index of the output to forward (0 = latest, default: 0)'
          },
          headers: {
            type: 'object',
            description: 'Optional HTTP headers to include'
          }
        }
      }
    },
    {
      name: 'forward_output_to_target',
      description: 'Forward OTEL output (from collector or refinery) to any target URL. Use this to send collected data to Honeycomb, another collector, or any OTLP-compatible endpoint.',
      inputSchema: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            enum: ['otelcol', 'refinery'],
            description: 'Source of the output to forward: "otelcol" or "refinery"'
          },
          targetUrl: {
            type: 'string',
            description: 'Target URL to send the data to (e.g., "http://localhost:8080", "https://api.honeycomb.io")'
          },
          outputIndex: {
            type: 'number',
            description: 'Index of the output to forward (0 = latest, default: 0)'
          },
          headers: {
            type: 'object',
            description: 'Optional HTTP headers to include (e.g., {"x-honeycomb-team": "your-api-key"})'
          }
        },
        required: ['source', 'targetUrl']
      }
    },
    {
      name: 'clear_output_buffer',
      description: 'Clear the output buffer for otelcol or refinery',
      inputSchema: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            enum: ['otelcol', 'refinery', 'both'],
            description: 'Which buffer to clear: "otelcol", "refinery", or "both"'
          }
        },
        required: ['source']
      }
    },
    
    // Console output monitoring tools
    {
      name: 'get_otelcol_console_output',
      description: 'Get the latest console output (stdout/stderr) from the OTEL Collector process. Useful for monitoring process status, debugging errors, and understanding what the collector is doing.',
      inputSchema: {
        type: 'object',
        properties: {
          lines: {
            type: 'integer',
            description: 'Number of lines to retrieve from the end (tail). Default is 100.',
            minimum: 1,
            maximum: 500
          }
        }
      }
    },
    {
      name: 'get_refinery_console_output',
      description: 'Get the latest console output (stdout/stderr) from the Refinery process. Useful for monitoring process status, debugging errors, and understanding what refinery is doing.',
      inputSchema: {
        type: 'object',
        properties: {
          lines: {
            type: 'integer',
            description: 'Number of lines to retrieve from the end (tail). Default is 100.',
            minimum: 1,
            maximum: 500
          }
        }
      }
    },
    {
      name: 'get_console_output_paginated',
      description: 'Get console output with pagination support. Useful for retrieving large amounts of output or reviewing historical logs.',
      inputSchema: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            enum: ['otelcol', 'refinery'],
            description: 'Which process console output to retrieve'
          },
          page: {
            type: 'integer',
            description: 'Page number (1-based). Default is 1.',
            minimum: 1
          },
          pageSize: {
            type: 'integer',
            description: 'Number of lines per page. Default is 50.',
            minimum: 1,
            maximum: 200
          }
        },
        required: ['source']
      }
    },
    {
      name: 'search_console_output',
      description: 'Search console output for specific patterns. Useful for finding errors, warnings, or specific log messages.',
      inputSchema: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            enum: ['otelcol', 'refinery'],
            description: 'Which process console output to search'
          },
          pattern: {
            type: 'string',
            description: 'String or regex pattern to search for'
          },
          caseSensitive: {
            type: 'boolean',
            description: 'Whether to use case-sensitive matching. Default is false.'
          }
        },
        required: ['source', 'pattern']
      }
    },
    {
      name: 'clear_console_buffer',
      description: 'Clear the console output buffer for otelcol or refinery',
      inputSchema: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            enum: ['otelcol', 'refinery', 'both'],
            description: 'Which console buffer to clear'
          }
        },
        required: ['source']
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
      // Broadcast config change to UI
      broadcastMcpActivity('config_saved', { 
        type: 'main_config',
        message: 'Main configuration updated via MCP'
      });
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
      // Broadcast YAML save to UI
      broadcastMcpActivity('yaml_saved', { 
        path: args.path,
        content: args.content,
        message: `YAML file saved: ${args.path}`
      });
      return { message: 'YAML saved successfully' };
    
    case 'get_json':
      return { content: read_json(args.path) };
    
    case 'save_json':
      save_json(args.path, args.content);
      // Broadcast JSON save to UI
      broadcastMcpActivity('json_saved', { 
        path: args.path,
        content: args.content,
        message: `JSON file saved: ${args.path}`
      });
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
      // Broadcast OTEL data submission to UI BEFORE sending
      broadcastMcpActivity('otel_data_submitting', {
        url: args.url,
        json: args.json,
        message: 'OTEL data being submitted via MCP'
      });
      const otelResult = await sendOtelJson(args.url, args.json, args.headers || {});
      // Broadcast result after sending
      broadcastMcpActivity('otel_data_submitted', {
        url: args.url,
        result: otelResult,
        message: 'OTEL data submitted via MCP'
      });
      return otelResult;
    
    case 'get_otelcol_output':
      return await getOtelcolOutput(args.duration || 30);
    
    case 'get_refinery_output':
      return await getRefineryOutput(args.duration || 30);
    
    case 'get_otelcol_modules':
      return await getOtelcolModules(args.version);
    
    case 'get_latest_otelcol_output':
      return getLatestOtelcolOutputTool(args.count || 10);
    
    case 'get_latest_refinery_output':
      return getLatestRefineryOutputTool(args.count || 10);
    
    case 'forward_otelcol_output_to_refinery':
      return await forwardOtelcolOutputToRefinery(args.outputIndex || 0, args.headers || {});
    
    case 'forward_output_to_target':
      return await forwardOutputToTarget(args.source, args.targetUrl, args.outputIndex || 0, args.headers || {});
    
    case 'clear_output_buffer':
      return clearOutputBuffer(args.source);
    
    case 'get_otelcol_console_output':
      return getOtelcolConsoleOutputTool(args.lines || 100);
    
    case 'get_refinery_console_output':
      return getRefineryConsoleOutputTool(args.lines || 100);
    
    case 'get_console_output_paginated':
      return getConsoleOutputPaginatedTool(args.source, args.page || 1, args.pageSize || 50);
    
    case 'search_console_output':
      return searchConsoleOutputTool(args.source, args.pattern, args.caseSensitive || false);
    
    case 'clear_console_buffer':
      return clearConsoleBuffer(args.source);
    
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
      // Store in console buffer for MCP access
      if (storeOtelcolConsoleOutput) {
        storeOtelcolConsoleOutput(output);
      }
      if (otelcol_stdout_ws) {
        otelcol_stdout_ws.send(output);
      }
      updateTask(taskId, {
        output: [...(tasks.get(taskId).output || []), { type: 'stdout', data: output }]
      });
    });
    
    childProcess.stderr.on("data", (data) => {
      const output = data.toString();
      // Store in console buffer for MCP access
      if (storeOtelcolConsoleOutput) {
        storeOtelcolConsoleOutput(output);
      }
      if (otelcol_stdout_ws) {
        otelcol_stdout_ws.send(output);
      }
      updateTask(taskId, {
        output: [...(tasks.get(taskId).output || []), { type: 'stderr', data: output }]
      });
    });
    
    childProcess.on("close", (code) => {
      const exitMsg = "[EXIT] otelcol exited with code " + code + "\n";
      // Store in console buffer for MCP access
      if (storeOtelcolConsoleOutput) {
        storeOtelcolConsoleOutput(exitMsg);
      }
      updateTask(taskId, {
        status: 'completed',
        data: { ...tasks.get(taskId).data, exitCode: code }
      });
      if (otelcol_stdout_ws) {
        otelcol_stdout_ws.send(exitMsg);
      }
    });
    
    childProcess.on("error", (err) => {
      const errorMsg = "[ERROR] " + err.toString() + "\n";
      // Store in console buffer for MCP access
      if (storeOtelcolConsoleOutput) {
        storeOtelcolConsoleOutput(errorMsg);
      }
      updateTask(taskId, {
        status: 'failed',
        error: err.toString()
      });
      if (otelcol_stdout_ws) {
        otelcol_stdout_ws.send(errorMsg);
      }
    });
    
    // Broadcast process start to UI
    broadcastMcpActivity('process_started', {
      type: 'otelcol',
      pid: pid,
      message: 'OTEL Collector started via MCP'
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
      // Store in console buffer for MCP access
      if (storeRefineryConsoleOutput) {
        storeRefineryConsoleOutput(output);
      }
      if (refinery_stdout_ws) {
        refinery_stdout_ws.send(output);
      }
      updateTask(taskId, {
        output: [...(tasks.get(taskId).output || []), { type: 'stdout', data: output }]
      });
    });
    
    childProcess.stderr.on("data", (data) => {
      const output = data.toString();
      // Store in console buffer for MCP access
      if (storeRefineryConsoleOutput) {
        storeRefineryConsoleOutput(output);
      }
      if (refinery_stdout_ws) {
        refinery_stdout_ws.send(output);
      }
      updateTask(taskId, {
        output: [...(tasks.get(taskId).output || []), { type: 'stderr', data: output }]
      });
    });
    
    childProcess.on("close", (code) => {
      const exitMsg = "[EXIT] refinery exited with code " + code;
      // Store in console buffer for MCP access
      if (storeRefineryConsoleOutput) {
        storeRefineryConsoleOutput(exitMsg);
      }
      updateTask(taskId, {
        status: 'completed',
        data: { ...tasks.get(taskId).data, exitCode: code }
      });
      if (refinery_stdout_ws) {
        refinery_stdout_ws.send(exitMsg);
      }
    });
    
    childProcess.on("error", (err) => {
      const errorMsg = "[ERROR] " + err.toString();
      // Store in console buffer for MCP access
      if (storeRefineryConsoleOutput) {
        storeRefineryConsoleOutput(errorMsg);
      }
      updateTask(taskId, {
        status: 'failed',
        error: err.toString()
      });
      if (refinery_stdout_ws) {
        refinery_stdout_ws.send(errorMsg);
      }
    });
    
    // Broadcast process start to UI
    broadcastMcpActivity('process_started', {
      type: 'refinery',
      pid: pid,
      message: 'Refinery started via MCP'
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
        // Broadcast process stop to UI
        broadcastMcpActivity('process_stopped', {
          type: type,
          pid: pid,
          message: `${type} stopped via MCP`
        });
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
        // Broadcast process refresh to UI
        broadcastMcpActivity('process_refreshed', {
          type: type,
          pid: pid,
          message: `${type} configuration refreshed via MCP`
        });
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
  // Broadcast saved JSON update to UI
  broadcastMcpActivity('saved_json_updated', {
    name: file,
    data: data,
    message: `Saved JSON '${file}' updated via MCP`
  });
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

/**
 * Output retrieval and forwarding tool implementations
 */

function getLatestOtelcolOutputTool(count) {
  if (!getLatestOtelcolOutputs) {
    return { outputs: [], message: 'Output buffer not initialized' };
  }
  const outputs = getLatestOtelcolOutputs(Math.min(count, 50));
  return {
    outputs,
    count: outputs.length,
    message: outputs.length > 0 
      ? `Retrieved ${outputs.length} otelcol output(s)` 
      : 'No otelcol outputs available. Send data to the collector first.'
  };
}

function getLatestRefineryOutputTool(count) {
  if (!getLatestRefineryOutputs) {
    return { outputs: [], message: 'Output buffer not initialized' };
  }
  const outputs = getLatestRefineryOutputs(Math.min(count, 50));
  return {
    outputs,
    count: outputs.length,
    message: outputs.length > 0 
      ? `Retrieved ${outputs.length} refinery output(s)` 
      : 'No refinery outputs available. Start refinery and send data through it first.'
  };
}

async function forwardOtelcolOutputToRefinery(outputIndex, headers) {
  if (!getLatestOtelcolOutputs) {
    throw new Error('Output buffer not initialized');
  }
  
  const outputs = getLatestOtelcolOutputs(outputIndex + 1);
  if (outputs.length <= outputIndex) {
    throw new Error(`No output at index ${outputIndex}. Only ${outputs.length} outputs available.`);
  }
  
  const output = outputs[outputIndex];
  const config = get_config();
  const refineryUrl = `http://localhost:8080`; // Default refinery HTTP endpoint
  
  // Prepare the data based on output type
  let url = refineryUrl;
  let jsonData = output.data;
  
  if (output.type === 'traces') {
    url += '/v1/traces';
    if (!jsonData.resourceSpans) {
      jsonData = { resourceSpans: [jsonData] };
    }
  } else if (output.type === 'metrics') {
    url += '/v1/metrics';
    if (!jsonData.resourceMetrics) {
      jsonData = { resourceMetrics: [jsonData] };
    }
  } else if (output.type === 'logs') {
    url += '/v1/logs';
    if (!jsonData.resourceLogs) {
      jsonData = { resourceLogs: [jsonData] };
    }
  }
  
  // Broadcast activity to UI
  broadcastMcpActivity('output_forwarding', {
    source: 'otelcol',
    target: 'refinery',
    url: url,
    type: output.type,
    message: `Forwarding ${output.type} from otelcol to refinery`
  });
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(jsonData),
      headers: { 
        ...headers, 
        'Content-Type': 'application/json',
        'x-honeycomb-team': headers['x-honeycomb-team'] || '1234567890'
      }
    });
    
    const result = {
      sent: response.status === 200,
      status: response.status,
      statusText: response.statusText,
      url: url,
      type: output.type,
      message: response.status === 200 
        ? `Successfully forwarded ${output.type} to refinery` 
        : `Failed to forward ${output.type} to refinery`
    };
    
    // Broadcast result to UI
    broadcastMcpActivity('output_forwarded', {
      source: 'otelcol',
      target: 'refinery',
      result: result,
      message: result.message
    });
    
    return result;
  } catch (err) {
    throw new Error(`Failed to forward to refinery: ${err.message}`);
  }
}

async function forwardOutputToTarget(source, targetUrl, outputIndex, headers) {
  const getOutputs = source === 'otelcol' ? getLatestOtelcolOutputs : getLatestRefineryOutputs;
  
  if (!getOutputs) {
    throw new Error('Output buffer not initialized');
  }
  
  const outputs = getOutputs(outputIndex + 1);
  if (outputs.length <= outputIndex) {
    throw new Error(`No output at index ${outputIndex}. Only ${outputs.length} outputs available.`);
  }
  
  const output = outputs[outputIndex];
  
  // Prepare the data based on output type
  let url = targetUrl;
  let jsonData = output.data;
  
  if (output.type === 'traces') {
    if (!url.endsWith('/v1/traces')) url += '/v1/traces';
    if (!jsonData.resourceSpans) {
      jsonData = { resourceSpans: [jsonData] };
    }
  } else if (output.type === 'metrics') {
    if (!url.endsWith('/v1/metrics')) url += '/v1/metrics';
    if (!jsonData.resourceMetrics) {
      jsonData = { resourceMetrics: [jsonData] };
    }
  } else if (output.type === 'logs') {
    if (!url.endsWith('/v1/logs')) url += '/v1/logs';
    if (!jsonData.resourceLogs) {
      jsonData = { resourceLogs: [jsonData] };
    }
  }
  
  // Broadcast activity to UI
  broadcastMcpActivity('output_forwarding', {
    source: source,
    target: targetUrl,
    url: url,
    type: output.type,
    message: `Forwarding ${output.type} from ${source} to ${targetUrl}`
  });
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(jsonData),
      headers: { 
        ...headers, 
        'Content-Type': 'application/json'
      }
    });
    
    const result = {
      sent: response.status === 200,
      status: response.status,
      statusText: response.statusText,
      url: url,
      source: source,
      type: output.type,
      message: response.status === 200 
        ? `Successfully forwarded ${output.type} to ${targetUrl}` 
        : `Failed to forward ${output.type} to ${targetUrl}`
    };
    
    // Broadcast result to UI
    broadcastMcpActivity('output_forwarded', {
      source: source,
      target: targetUrl,
      result: result,
      message: result.message
    });
    
    return result;
  } catch (err) {
    throw new Error(`Failed to forward to ${targetUrl}: ${err.message}`);
  }
}

function clearOutputBuffer(source) {
  if (source === 'otelcol' || source === 'both') {
    if (clearOtelcolOutputBuffer) {
      clearOtelcolOutputBuffer();
    }
  }
  if (source === 'refinery' || source === 'both') {
    if (clearRefineryOutputBuffer) {
      clearRefineryOutputBuffer();
    }
  }
  
  broadcastMcpActivity('output_buffer_cleared', {
    source: source,
    message: `Output buffer cleared: ${source}`
  });
  
  return { 
    message: `Output buffer cleared: ${source}`,
    source: source
  };
}

/**
 * Console output tool implementations
 */

function getOtelcolConsoleOutputTool(lines) {
  if (!getOtelcolConsoleOutput) {
    return { error: 'Console output buffer not available' };
  }
  
  const result = getOtelcolConsoleOutput(lines);
  
  return {
    source: 'otelcol',
    ...result,
    // Format lines for easy reading
    output: result.lines.map(l => `[${l.timestamp}] ${l.line}`).join('\n')
  };
}

function getRefineryConsoleOutputTool(lines) {
  if (!getRefineryConsoleOutput) {
    return { error: 'Console output buffer not available' };
  }
  
  const result = getRefineryConsoleOutput(lines);
  
  return {
    source: 'refinery',
    ...result,
    // Format lines for easy reading
    output: result.lines.map(l => `[${l.timestamp}] ${l.line}`).join('\n')
  };
}

function getConsoleOutputPaginatedTool(source, page, pageSize) {
  const getter = source === 'otelcol' ? getOtelcolConsoleOutputPaginated : getRefineryConsoleOutputPaginated;
  
  if (!getter) {
    return { error: 'Console output buffer not available' };
  }
  
  const result = getter(page, pageSize);
  
  return {
    source,
    ...result,
    // Format lines for easy reading
    output: result.lines.map(l => `[${l.timestamp}] ${l.line}`).join('\n')
  };
}

function searchConsoleOutputTool(source, pattern, caseSensitive) {
  if (!searchConsoleOutput) {
    return { error: 'Console output search not available' };
  }
  
  const result = searchConsoleOutput(source, pattern, caseSensitive);
  
  return {
    source,
    ...result,
    // Format matches for easy reading
    matchedLines: result.matches.map(m => `[${m.timestamp}] Line ${m.index}: ${m.line}`).join('\n')
  };
}

function clearConsoleBuffer(source) {
  if (source === 'otelcol' || source === 'both') {
    if (clearOtelcolConsoleBuffer) {
      clearOtelcolConsoleBuffer();
    }
  }
  if (source === 'refinery' || source === 'both') {
    if (clearRefineryConsoleBuffer) {
      clearRefineryConsoleBuffer();
    }
  }
  
  broadcastMcpActivity('console_buffer_cleared', {
    source: source,
    message: `Console buffer cleared: ${source}`
  });
  
  return { 
    message: `Console buffer cleared: ${source}`,
    source: source
  };
}

/**
 * MCP Resources Implementation
 */

// Resource cache for expensive operations
const resourceCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedResource(key) {
  const cached = resourceCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedResource(key, data) {
  resourceCache.set(key, { data, timestamp: Date.now() });
}

function handleResourcesList(id, res) {
  const resources = [
    // System status
    {
      uri: 'system://status',
      name: 'System Status',
      description: 'Complete system state including installation status, running processes, and configuration',
      mimeType: 'application/json'
    },

    // Templates
    {
      uri: 'templates://list',
      name: 'Template List',
      description: 'List all available OTEL JSON templates',
      mimeType: 'application/json'
    },

    // Endpoints
    {
      uri: 'endpoints://info',
      name: 'Endpoint Information',
      description: 'HTTP and WebSocket endpoints exposed by the server',
      mimeType: 'application/json'
    },

    // Configurations
    {
      uri: 'config://otelcol',
      name: 'OTEL Collector Configuration',
      description: 'Parsed OTEL Collector configuration with pipeline structure',
      mimeType: 'application/json'
    },
    {
      uri: 'config://refinery',
      name: 'Refinery Configuration',
      description: 'Parsed Refinery configuration',
      mimeType: 'application/json'
    },

    // Processes
    {
      uri: 'processes://list',
      name: 'Process List',
      description: 'Enhanced process information with context',
      mimeType: 'application/json'
    },

    // Saved JSON
    {
      uri: 'saved://list',
      name: 'Saved JSON List',
      description: 'List all saved JSON files with metadata',
      mimeType: 'application/json'
    },

    // Versions
    {
      uri: 'versions://available',
      name: 'Available Versions',
      description: 'All available versions for OTEL Collector and Refinery',
      mimeType: 'application/json'
    },

    // Modules
    {
      uri: 'modules://otelcol',
      name: 'OTEL Collector Modules',
      description: 'Available OTEL Collector modules',
      mimeType: 'application/json'
    },

    // Schema
    {
      uri: 'schema://otel',
      name: 'OTEL JSON Schema',
      description: 'OTEL JSON schema for validation',
      mimeType: 'application/json'
    },
    
    // Output buffers
    {
      uri: 'output://otelcol/latest',
      name: 'Latest OTEL Collector Outputs',
      description: 'Latest outputs received from the OTEL Collector (traces, metrics, logs)',
      mimeType: 'application/json'
    },
    {
      uri: 'output://refinery/latest',
      name: 'Latest Refinery Outputs',
      description: 'Latest outputs received from Refinery (traces, metrics, logs)',
      mimeType: 'application/json'
    },
    
    // Console output resources
    {
      uri: 'console://otelcol/latest',
      name: 'OTEL Collector Console Output',
      description: 'Latest console output (stdout/stderr) from the OTEL Collector process',
      mimeType: 'text/plain'
    },
    {
      uri: 'console://refinery/latest',
      name: 'Refinery Console Output',
      description: 'Latest console output (stdout/stderr) from the Refinery process',
      mimeType: 'text/plain'
    },

    // Skills (guidance for AI agents on how to use oteltester)
    {
      uri: 'skills://list',
      name: 'Oteltester Skills Index',
      description: 'List all available skill resources for learning how to use oteltester effectively',
      mimeType: 'application/json'
    },
    {
      uri: 'skills://overview',
      name: 'Oteltester Overview',
      description: 'Executive overview of oteltester capabilities and when to use each skill',
      mimeType: 'application/json'
    },
    {
      uri: 'skills://installation',
      name: 'Installation Skill',
      description: 'How to install and run different versions of OTEL Collector and Honeycomb Refinery',
      mimeType: 'application/json'
    },
    {
      uri: 'skills://configuration',
      name: 'Configuration Skill',
      description: 'How to formulate YAML configs for OTEL Collector and Refinery (config + rules)',
      mimeType: 'application/json'
    },
    {
      uri: 'skills://testing-workflow',
      name: 'Testing Workflow Skill',
      description: 'Submit OTLP JSON, monitor logs/results, and conditionally re-submit to Refinery',
      mimeType: 'application/json'
    },
    {
      uri: 'skills://collector-verification',
      name: 'Collector Verification Skill',
      description: 'How to verify correctness of OTEL Collector config (receiving, processing, exporting)',
      mimeType: 'application/json'
    },
    {
      uri: 'skills://refinery-verification',
      name: 'Refinery Verification Skill',
      description: 'How to verify correctness of Refinery sampling rules',
      mimeType: 'application/json'
    },
    {
      uri: 'skills://honeycomb-forwarding',
      name: 'Honeycomb Forwarding Skill',
      description: 'How to send data to Honeycomb via ingestion API (requires API key from user)',
      mimeType: 'application/json'
    }
  ];

  res.json({
    jsonrpc: '2.0',
    id,
    result: {
      resources
    }
  });
}

async function handleResourcesRead(id, params, res) {
  const { uri } = params;

  try {
    let content;

    // Match URI patterns
    if (uri === 'system://status') {
      content = await getSystemStatusResource();
    } else if (uri === 'templates://list') {
      content = await getTemplatesListResource();
    } else if (uri.startsWith('templates://')) {
      const name = uri.replace('templates://', '');
      content = await getTemplateResource(name);
    } else if (uri === 'endpoints://info') {
      content = await getEndpointsInfoResource();
    } else if (uri === 'config://otelcol') {
      content = await getOtelcolConfigResource();
    } else if (uri === 'config://refinery') {
      content = await getRefineryConfigResource();
    } else if (uri === 'processes://list') {
      content = await getProcessesListResource();
    } else if (uri === 'saved://list') {
      content = await getSavedListResource();
    } else if (uri.startsWith('saved://')) {
      const name = uri.replace('saved://', '');
      content = await getSavedResource(name);
    } else if (uri === 'versions://available') {
      content = await getVersionsAvailableResource();
    } else if (uri === 'modules://otelcol') {
      content = await getModulesOtelcolResource();
    } else if (uri === 'schema://otel') {
      content = await getSchemaOtelResource();
    } else if (uri === 'output://otelcol/latest') {
      content = getOtelcolOutputResource();
    } else if (uri === 'output://refinery/latest') {
      content = getRefineryOutputResource();
    } else if (uri === 'console://otelcol/latest') {
      content = getOtelcolConsoleResource();
    } else if (uri === 'console://refinery/latest') {
      content = getRefineryConsoleResource();
    } else if (uri === 'skills://list') {
      content = getSkillsListResource();
    } else if (uri.startsWith('skills://')) {
      const skillName = uri.replace('skills://', '');
      content = getSkillResource(skillName);
    } else {
      return res.json({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32002,
          message: `Resource not found: ${uri}`
        }
      });
    }

    res.json({
      jsonrpc: '2.0',
      id,
      result: {
        contents: [content]
      }
    });
  } catch (error) {
    res.json({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32000,
        message: error.message || 'Resource read failed',
        data: error.stack
      }
    });
  }
}

/**
 * Resource Handler Functions
 */

async function getSystemStatusResource() {
  const config = get_config();
  const pids = get_pids();

  // Find OTEL Collector process
  let otelcolPid = null;
  let otelcolRunning = false;
  for (const p of pids) {
    if (p[7] && p[7].includes('otelcol')) {
      otelcolPid = p[1];
      otelcolRunning = true;
      break;
    }
  }

  // Find Refinery process
  let refineryPid = null;
  let refineryRunning = false;
  for (const p of pids) {
    if (p[7] && p[7].includes('refinery')) {
      refineryPid = p[1];
      refineryRunning = true;
      break;
    }
  }

  const status = {
    version: '1.0.0',
    otelCollector: {
      installed: config.collector_installed,
      version: config.collector_version || '0.0.0',
      running: otelcolRunning,
      pid: otelcolPid,
      configPath: config.otel_collector?.config_path || null,
      configExists: config.collector_config_exists
    },
    refinery: {
      installed: config.refinery_installed,
      version: config.refinery_version || '0.0.0',
      running: refineryRunning,
      pid: refineryPid,
      configPath: config.refinery?.config_path || null,
      rulePath: config.refinery?.rule_path || null,
      configExists: config.refinery_config_exists,
      ruleExists: config.refinery_rule_exists
    },
    endpoints: {
      otlpHttp: config.otel_collector?.otlp_endpoint || 'http://localhost:4318',
      otlpGrpc: config.otel_collector?.otlp_grpc_endpoint || 'grpc://localhost:4317'
    },
    system: {
      architecture: config['os.arch'],
      platform: config['os.platform'],
      is64bit: config['os.is64bit']
    }
  };

  return {
    uri: 'system://status',
    mimeType: 'application/json',
    text: JSON.stringify(status, null, 2)
  };
}

async function getTemplatesListResource() {
  const config = get_config();
  const templateDir = config.template_dir;

  if (!fs.existsSync(templateDir)) {
    throw new Error(`Template directory not found: ${templateDir}`);
  }

  const files = readdirSync(templateDir);
  const jsonFiles = files.filter(file => file.endsWith('.json'));

  const templates = [];
  for (const file of jsonFiles) {
    const name = file.replace('.json', '');
    const path = `${templateDir}/${file}`;

    try {
      const content = read_json(path);
      let type = 'unknown';

      if (content.resourceSpans) {
        type = content.resourceMetrics || content.resourceLogs ? 'combo' : 'trace';
      } else if (content.resourceMetrics) {
        type = 'metric';
      } else if (content.resourceLogs) {
        type = 'log';
      }

      templates.push({
        name,
        path,
        type,
        uri: `templates://${name}`
      });
    } catch (error) {
      // Skip files that can't be parsed
      console.error(`Error parsing template ${file}:`, error.message);
    }
  }

  return {
    uri: 'templates://list',
    mimeType: 'application/json',
    text: JSON.stringify({ templates }, null, 2)
  };
}

async function getTemplateResource(name) {
  const config = get_config();
  const sanitizedName = name.replace('..', '');
  const path = `${config.template_dir}/${sanitizedName}.json`;

  if (!fs.existsSync(path)) {
    throw new Error(`Template not found: ${name}`);
  }

  const content = read_json(path);
  if (!content) {
    throw new Error(`Failed to read template: ${name}`);
  }

  // Detect placeholders
  const jsonString = JSON.stringify(content);
  const placeholderMatches = jsonString.match(/\{\{[^}]+\}\}/g) || [];
  const placeholders = [...new Set(placeholderMatches)];

  // Detect time fields
  const timeFields = [];
  const findTimeFields = (obj, prefix = '') => {
    for (const key in obj) {
      if (key.toLowerCase().includes('time') && key.toLowerCase().includes('nano')) {
        timeFields.push(prefix ? `${prefix}.${key}` : key);
      }
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        findTimeFields(obj[key], prefix ? `${prefix}.${key}` : key);
      }
    }
  };
  findTimeFields(content);

  // Detect type
  let type = 'unknown';
  if (content.resourceSpans) {
    type = content.resourceMetrics || content.resourceLogs ? 'combo' : 'trace';
  } else if (content.resourceMetrics) {
    type = 'metric';
  } else if (content.resourceLogs) {
    type = 'log';
  }

  const result = {
    name,
    path,
    type,
    content,
    metadata: {
      placeholders,
      timeFields
    }
  };

  return {
    uri: `templates://${name}`,
    mimeType: 'application/json',
    text: JSON.stringify(result, null, 2)
  };
}

async function getEndpointsInfoResource() {
  const config = get_config();

  const endpoints = {
    http: {
      endpoints: [
        { path: '/v1/traces', method: 'POST', purpose: 'Receive OTLP traces (HTTP)' },
        { path: '/v1/metrics', method: 'POST', purpose: 'Receive OTLP metrics (HTTP)' },
        { path: '/v1/logs', method: 'POST', purpose: 'Receive OTLP logs (HTTP)' },
        { path: '/api/otel', method: 'POST', purpose: 'Send OTEL JSON data (internal API)' },
        { path: '/api/config', method: 'GET', purpose: 'Get configuration' },
        { path: '/api/config', method: 'POST', purpose: 'Update configuration' },
        { path: '/mcp', method: 'POST', purpose: 'MCP JSON-RPC endpoint' }
      ],
      baseUrl: `http://${config.host_name || 'localhost:3000'}`
    },
    websocket: {
      channels: [
        { path: '/otelcol_out', purpose: 'OTEL Collector OTLP output' },
        { path: '/refinery_out', purpose: 'Refinery batch output' },
        { path: '/otelcol_stdout', purpose: 'OTEL Collector stdout/stderr' },
        { path: '/refinery_stdout', purpose: 'Refinery stdout/stderr' },
        { path: '/otelcol_setup', purpose: 'OTEL Collector installation progress' },
        { path: '/refinery_setup', purpose: 'Refinery installation progress' }
      ],
      baseUrl: `ws://${config.host_name || 'localhost:3000'}`
    },
    otlp: {
      http: config.otel_collector?.otlp_endpoint || 'http://localhost:4318',
      grpc: config.otel_collector?.otlp_grpc_endpoint || 'grpc://localhost:4317'
    }
  };

  return {
    uri: 'endpoints://info',
    mimeType: 'application/json',
    text: JSON.stringify(endpoints, null, 2)
  };
}

async function getOtelcolConfigResource() {
  const config = get_config();
  const configPath = config.otel_collector?.config_path;

  if (!configPath || !fs.existsSync(configPath)) {
    throw new Error('OTEL Collector configuration file not found');
  }

  const yamlContent = read_yaml(configPath);
  const parsedConfig = yaml_to_json(yamlContent);

  // Extract structure
  const receivers = parsedConfig.receivers ? Object.keys(parsedConfig.receivers) : [];
  const processors = parsedConfig.processors ? Object.keys(parsedConfig.processors) : [];
  const exporters = parsedConfig.exporters ? Object.keys(parsedConfig.exporters) : [];
  const extensions = parsedConfig.extensions ? Object.keys(parsedConfig.extensions) : [];

  const pipelines = {};
  if (parsedConfig.service?.pipelines) {
    for (const [pipelineName, pipelineConfig] of Object.entries(parsedConfig.service.pipelines)) {
      pipelines[pipelineName] = {
        receivers: pipelineConfig.receivers || [],
        processors: pipelineConfig.processors || [],
        exporters: pipelineConfig.exporters || []
      };
    }
  }

  const result = {
    path: configPath,
    rawYaml: yamlContent,
    parsed: {
      receivers,
      processors,
      exporters,
      extensions,
      pipelines
    },
    fullConfig: parsedConfig
  };

  return {
    uri: 'config://otelcol',
    mimeType: 'application/json',
    text: JSON.stringify(result, null, 2)
  };
}

async function getRefineryConfigResource() {
  const config = get_config();
  const configPath = config.refinery?.config_path;

  if (!configPath || !fs.existsSync(configPath)) {
    throw new Error('Refinery configuration file not found');
  }

  const yamlContent = read_yaml(configPath);
  const parsedConfig = yaml_to_json(yamlContent);

  const result = {
    path: configPath,
    rawYaml: yamlContent,
    parsed: parsedConfig
  };

  return {
    uri: 'config://refinery',
    mimeType: 'application/json',
    text: JSON.stringify(result, null, 2)
  };
}

async function getProcessesListResource() {
  const config = get_config();
  const pids = get_pids();

  const processes = [];
  for (const p of pids) {
    const pid = p[1];
    const command = p[7];

    let type = 'unknown';
    let configPath = null;

    if (command.includes('otelcol')) {
      type = 'otelcol';
      configPath = config.otel_collector?.config_path;
    } else if (command.includes('refinery')) {
      type = 'refinery';
      configPath = config.refinery?.config_path;
    }

    processes.push({
      pid,
      type,
      command: p.slice(7).join(' '),
      user: p[0],
      startTime: p[4],
      configPath
    });
  }

  return {
    uri: 'processes://list',
    mimeType: 'application/json',
    text: JSON.stringify({ processes }, null, 2)
  };
}

async function getSavedListResource() {
  const config = get_config();
  const savedDir = `${config.work_dir}/saved`;

  if (!fs.existsSync(savedDir)) {
    throw new Error(`Saved directory not found: ${savedDir}`);
  }

  const files = readdirSync(savedDir);
  const jsonFiles = files.filter(file => file.endsWith('.json'));

  const saved = [];
  for (const file of jsonFiles) {
    const name = file.replace('.json', '');
    const path = `${savedDir}/${file}`;

    try {
      const stats = fs.statSync(path);
      const content = read_json(path);

      let type = 'unknown';
      if (content.resourceSpans) {
        type = content.resourceMetrics || content.resourceLogs ? 'combo' : 'trace';
      } else if (content.resourceMetrics) {
        type = 'metric';
      } else if (content.resourceLogs) {
        type = 'log';
      }

      saved.push({
        name,
        path,
        type,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        uri: `saved://${name}`
      });
    } catch (error) {
      console.error(`Error processing saved file ${file}:`, error.message);
    }
  }

  return {
    uri: 'saved://list',
    mimeType: 'application/json',
    text: JSON.stringify({ saved }, null, 2)
  };
}

async function getSavedResource(name) {
  const config = get_config();
  const sanitizedName = name.replace('..', '');
  const path = `${config.work_dir}/saved/${sanitizedName}.json`;

  if (!fs.existsSync(path)) {
    throw new Error(`Saved file not found: ${name}`);
  }

  const content = read_json(path);
  if (!content) {
    throw new Error(`Failed to read saved file: ${name}`);
  }

  // Validate
  const validation = validate_otel_json(content);

  // Detect type
  let type = 'unknown';
  if (content.resourceSpans) {
    type = content.resourceMetrics || content.resourceLogs ? 'combo' : 'trace';
  } else if (content.resourceMetrics) {
    type = 'metric';
  } else if (content.resourceLogs) {
    type = 'log';
  }

  const result = {
    name,
    path,
    type,
    content,
    validation: {
      valid: validation.valid,
      errors: validation.errors || []
    }
  };

  return {
    uri: `saved://${name}`,
    mimeType: 'application/json',
    text: JSON.stringify(result, null, 2)
  };
}

async function getVersionsAvailableResource() {
  // Check cache first
  const cached = getCachedResource('versions://available');
  if (cached) {
    return cached;
  }

  try {
    const [otelcolVersions, refineryVersions] = await Promise.all([
      get_otelcol_versions(),
      get_refinery_versions()
    ]);

    const result = {
      otelCollector: otelcolVersions,
      refinery: refineryVersions
    };

    const resource = {
      uri: 'versions://available',
      mimeType: 'application/json',
      text: JSON.stringify(result, null, 2)
    };

    // Cache for 5 minutes
    setCachedResource('versions://available', resource);

    return resource;
  } catch (error) {
    throw new Error(`Failed to fetch versions: ${error.message}`);
  }
}

async function getModulesOtelcolResource() {
  try {
    const modulesResult = await getOtelcolModules();

    return {
      uri: 'modules://otelcol',
      mimeType: 'application/json',
      text: JSON.stringify(modulesResult.modules, null, 2)
    };
  } catch (error) {
    throw new Error(`Failed to fetch modules: ${error.message}`);
  }
}

async function getSchemaOtelResource() {
  const schemaPath = './backend/schema/otel-schema.json';

  if (!fs.existsSync(schemaPath)) {
    throw new Error('OTEL schema file not found');
  }

  const schemaContent = fs.readFileSync(schemaPath, 'utf8');

  return {
    uri: 'schema://otel',
    mimeType: 'application/json',
    text: schemaContent
  };
}

function getOtelcolOutputResource() {
  const outputs = getLatestOtelcolOutputs ? getLatestOtelcolOutputs(50) : [];
  
  return {
    uri: 'output://otelcol/latest',
    mimeType: 'application/json',
    text: JSON.stringify({
      count: outputs.length,
      outputs: outputs,
      note: outputs.length > 0 
        ? 'Outputs are ordered from newest to oldest'
        : 'No outputs available. Send data to the OTEL Collector first.'
    }, null, 2)
  };
}

function getRefineryOutputResource() {
  const outputs = getLatestRefineryOutputs ? getLatestRefineryOutputs(50) : [];
  
  return {
    uri: 'output://refinery/latest',
    mimeType: 'application/json',
    text: JSON.stringify({
      count: outputs.length,
      outputs: outputs,
      note: outputs.length > 0 
        ? 'Outputs are ordered from newest to oldest'
        : 'No outputs available. Start Refinery and send data through it first.'
    }, null, 2)
  };
}

function getOtelcolConsoleResource() {
  if (!getOtelcolConsoleOutput) {
    return {
      uri: 'console://otelcol/latest',
      mimeType: 'text/plain',
      text: 'Console output buffer not available. Server may need to be restarted.'
    };
  }
  
  const result = getOtelcolConsoleOutput(200); // Get last 200 lines
  
  return {
    uri: 'console://otelcol/latest',
    mimeType: 'text/plain',
    text: result.lines.length > 0 
      ? result.lines.map(l => `[${l.timestamp}] ${l.line}`).join('\n')
      : 'No console output available. Start the OTEL Collector process first.'
  };
}

function getRefineryConsoleResource() {
  if (!getRefineryConsoleOutput) {
    return {
      uri: 'console://refinery/latest',
      mimeType: 'text/plain',
      text: 'Console output buffer not available. Server may need to be restarted.'
    };
  }
  
  const result = getRefineryConsoleOutput(200); // Get last 200 lines
  
  return {
    uri: 'console://refinery/latest',
    mimeType: 'text/plain',
    text: result.lines.length > 0 
      ? result.lines.map(l => `[${l.timestamp}] ${l.line}`).join('\n')
      : 'No console output available. Start the Refinery process first.'
  };
}

/**
 * Skills Resources - Guidance for AI agents on how to use oteltester effectively
 */

const SKILLS = {
  list: {
    skills: [
      { uri: 'skills://overview', name: 'Overview', description: 'Executive overview of oteltester capabilities' },
      { uri: 'skills://installation', name: 'Installation', description: 'Install and run different versions of OTEL Collector and Refinery' },
      { uri: 'skills://configuration', name: 'Configuration', description: 'Formulate YAML configs for OTEL Collector and Refinery' },
      { uri: 'skills://testing-workflow', name: 'Testing Workflow', description: 'Submit OTLP JSON, monitor logs, re-submit to Refinery' },
      { uri: 'skills://collector-verification', name: 'Collector Verification', description: 'Verify OTEL Collector config correctness' },
      { uri: 'skills://refinery-verification', name: 'Refinery Verification', description: 'Verify Refinery sampling rules' },
      { uri: 'skills://honeycomb-forwarding', name: 'Honeycomb Forwarding', description: 'Send data to Honeycomb (requires API key)' }
    ],
    note: 'Read these skills to learn how to use oteltester. Start with skills://overview.'
  },
  overview: {
    purpose: 'oteltester is a web application for testing OpenTelemetry Collector and Honeycomb Refinery. AI agents can use it programmatically via MCP.',
    capabilities: [
      '1. Install and run different versions of OTEL Collector and Honeycomb Refinery',
      '2. Formulate YAML configurations for both OTEL Collector (receivers, processors, exporters) and Refinery (config + rules)',
      '3. Submit OTLP JSON (traces, metrics, logs) into the collector; monitor logs and output; conditionally re-submit to Refinery for sampling rule testing',
      '4. Verify correctness of OTEL Collector configuration (receiving, processing, exporting) and OTLP JSON payloads',
      '5. Verify correctness of Refinery sampling rules when that is the user\'s goal',
      '6. Optionally send data to Honeycomb (requires ingestion API key from user)'
    ],
    recommendedOrder: ['skills://installation', 'skills://configuration', 'skills://testing-workflow', 'skills://collector-verification', 'skills://refinery-verification', 'skills://honeycomb-forwarding'],
    quickStart: 'Read system://status first to check installation state. Then read skills://installation if binaries need to be installed.'
  },
  installation: {
    title: 'Installation and Version Management',
    description: 'How to install and run different versions of OpenTelemetry Collector and Honeycomb Refinery.',
    tools: ['get_otelcol_versions', 'get_refinery_versions', 'get_otelcol_version', 'get_refinery_version', 'install_otelcol', 'install_refinery', 'start_otelcol', 'start_refinery', 'stop_process'],
    resources: ['system://status', 'versions://available'],
    steps: [
      { step: 1, action: 'Check current state', tool: 'get_config or read system://status', note: 'See if collector/refinery are installed and which versions' },
      { step: 2, action: 'Get available versions', tool: 'get_otelcol_versions or get_refinery_versions', note: 'Or read versions://available for both' },
      { step: 3, action: 'Install desired version', tool: 'install_otelcol or install_refinery', note: 'Async operation - poll task until complete' },
      { step: 4, action: 'Start processes', tool: 'start_otelcol or start_refinery', note: 'Start after config is ready. Processes read from config_path in config.yaml' }
    ],
    note: 'Config paths are in config.yaml (otel_collector.config_path, refinery.config_path, refinery.rule_path). Save configs before starting.'
  },
  configuration: {
    title: 'Configuration Formulation',
    description: 'How to formulate YAML configurations for OTEL Collector and Refinery (config + rules).',
    tools: ['get_yaml', 'save_yaml', 'get_config', 'save_config', 'get_otelcol_modules'],
    resources: ['config://otelcol', 'config://refinery', 'modules://otelcol'],
    otelCollector: {
      structure: 'receivers, processors, exporters, extensions; service.pipelines binds them',
      configPath: 'From config.otel_collector.config_path (e.g. runtime/otelcol-config.yml)',
      modules: 'Use get_otelcol_modules or modules://otelcol to discover available receivers, processors, exporters',
      examplePipelines: 'traces, metrics, logs pipelines each specify receivers, processors, exporters'
    },
    refinery: {
      configPath: 'From config.refinery.config_path (e.g. runtime/refinery-config.yml)',
      rulePath: 'From config.refinery.rule_path (e.g. runtime/refinery-rule.yml)',
      note: 'Refinery needs both config (main settings) and rules (sampling rules)'
    },
    steps: [
      { step: 1, action: 'Read current config', tool: 'get_yaml with path from config', note: 'Or read config://otelcol / config://refinery' },
      { step: 2, action: 'Save new config', tool: 'save_yaml', note: 'Updates file; use refresh_process to reload without restart (otelcol: HUP, refinery: USR1)' },
      { step: 3, action: 'Validate structure', note: 'Read config://otelcol for parsed pipeline structure' }
    ]
  },
  'testing-workflow': {
    title: 'Testing Workflow',
    description: 'Submit OTLP JSON, monitor logs and results, conditionally re-submit to Refinery.',
    tools: ['send_otel_json', 'get_latest_otelcol_output', 'get_latest_refinery_output', 'forward_otelcol_output_to_refinery', 'get_otelcol_console_output', 'get_refinery_console_output', 'search_console_output'],
    resources: ['output://otelcol/latest', 'output://refinery/latest', 'console://otelcol/latest', 'console://refinery/latest', 'templates://list', 'saved://list'],
    workflow: [
      { phase: 'Setup', actions: ['Ensure otelcol is running (start_otelcol)', 'Optional: start refinery if testing sampling'] },
      { phase: 'Submit', actions: ['Get OTLP JSON from templates://<name> or saved://<name> or provided by user', 'send_otel_json to collector OTLP HTTP endpoint (e.g. http://localhost:4318)'] },
      { phase: 'Monitor', actions: ['get_otelcol_console_output or read console://otelcol/latest', 'get_latest_otelcol_output or read output://otelcol/latest', 'search_console_output for "error", "failed", "warn"'] },
      { phase: 'Validate', actions: ['Compare output to expected - check traces/metrics/logs arrived correctly', 'If testing refinery: forward_otelcol_output_to_refinery, then check output://refinery/latest'] }
    ],
    otlpEndpoint: 'Collector OTLP HTTP is typically http://localhost:4318. Check endpoints://info or system://status.'
  },
  'collector-verification': {
    title: 'OTEL Collector Configuration Verification',
    description: 'Verify correctness of OTEL Collector config: receiving, processing, and exporting.',
    tools: ['get_otelcol_console_output', 'get_latest_otelcol_output', 'search_console_output', 'send_otel_json'],
    resources: ['config://otelcol', 'output://otelcol/latest', 'console://otelcol/latest', 'schema://otel'],
    verificationSteps: [
      { area: 'Receiving', check: 'Data arrives at collector', action: 'Send known OTLP JSON via send_otel_json; check output://otelcol/latest for matching data' },
      { area: 'Processing', check: 'Processors run correctly', action: 'Check console for errors; verify output shape matches processor expectations (e.g. batch, filter)' },
      { area: 'Exporting', check: 'Data reaches exporter', action: 'If exporter is debug, check output buffer. If OTLP exporter, verify target receives data' }
    ],
    commonIssues: [
      'Invalid YAML: check console for parse errors',
      'Missing modules: use get_otelcol_modules to verify module names',
      'Pipeline mismatch: receivers/processors/exporters in pipeline must match defined components'
    ]
  },
  'refinery-verification': {
    title: 'Refinery Sampling Rules Verification',
    description: 'Verify correctness of Refinery sampling rules.',
    tools: ['forward_otelcol_output_to_refinery', 'get_latest_otelcol_output', 'get_latest_refinery_output', 'get_refinery_console_output'],
    resources: ['config://refinery', 'output://otelcol/latest', 'output://refinery/latest', 'console://refinery/latest'],
    workflow: [
      { step: 1, action: 'Ensure refinery is running with desired rules', note: 'Refinery reads config + rule_path on startup' },
      { step: 2, action: 'Send or forward traces to refinery', note: 'Use forward_otelcol_output_to_refinery to send collector output, or send_otel_json to refinery HTTP (e.g. http://localhost:8080)' },
      { step: 3, action: 'Compare otelcol vs refinery output', note: 'Sampling should reduce trace count; verify kept vs dropped matches rule logic' },
      { step: 4, action: 'Check refinery console', note: 'Use get_refinery_console_output or search_console_output for sampling decisions' }
    ]
  },
  'honeycomb-forwarding': {
    title: 'Sending Data to Honeycomb',
    description: 'Forward collected or refined data to Honeycomb. Requires ingestion API key from the user.',
    tools: ['forward_output_to_target', 'get_latest_otelcol_output', 'get_latest_refinery_output'],
    resources: ['output://otelcol/latest', 'output://refinery/latest'],
    honeycombEndpoint: 'https://api.honeycomb.io',
    headers: { 'x-honeycomb-team': 'API key (ask user for it)', 'x-honeycomb-dataset': 'Optional dataset name' },
    steps: [
      { step: 1, action: 'Get API key from user', note: 'Agents cannot access secrets. Ask: "Please provide your Honeycomb ingestion API key to forward data."' },
      { step: 2, action: 'Forward output', tool: 'forward_output_to_target', args: { source: 'otelcol or refinery', targetUrl: 'https://api.honeycomb.io', headers: { 'x-honeycomb-team': '<api-key>' } } },
      { step: 3, action: 'Verify', note: 'Check response status; data should appear in Honeycomb within seconds' }
    ],
    note: 'Config may have send_apikey; agents should prefer user-provided key for security. Never log or expose API keys.'
  }
};

function getSkillsListResource() {
  return {
    uri: 'skills://list',
    mimeType: 'application/json',
    text: JSON.stringify(SKILLS.list, null, 2)
  };
}

function getSkillResource(skillName) {
  const skill = SKILLS[skillName];
  if (!skill) {
    throw new Error(`Skill not found: ${skillName}. Read skills://list for available skills.`);
  }
  return {
    uri: `skills://${skillName}`,
    mimeType: 'application/json',
    text: JSON.stringify(skill, null, 2)
  };
}
