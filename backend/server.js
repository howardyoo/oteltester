import express from "express";
import path from "path";
import { exec } from "child_process";
import { get_pids, check_pid, get_type, save_yaml, read_yaml, read_yaml_from_url, save_json, read_json } from "./utils.js";
import { get_config, save_config, get_workdir } from "./config.js";
import { get_https_options } from './security.js';
import { install_otelcol, install_refinery, get_otelcol_versions, get_refinery_versions } from "./install.js";
import http from "http";
import https from "https";
import { WebSocketServer } from "ws";
import { spawn } from "child_process";
import { decode, decodeMulti, decodeStream, decodeMultiStream} from "@msgpack/msgpack";
import compression from "compression";
import zstd from "fast-zstd";
import { marked } from "marked";
import dotenvFlow from "dotenv-flow";
import { OpenAI } from "openai";
import { readdirSync, unlinkSync } from "fs";
import auth from "./auth.js";
import Ajv from "ajv";
import fs from "fs";
import { handleMCPRequest, setWebSocketRefs, captureOutputForTask, getActiveOutputTasks } from "./mcp.js";

// OTEL schema validator init.
const schema = JSON.parse(fs.readFileSync("./backend/schema/otel-schema.json", "utf8"));
const ajv = new Ajv({ allErrors: true});
// compile schema
const validate = ajv.compile(schema);

// load the environment variables (automatically loads .env.local, .env, and .env.development)
dotenvFlow.config();

const app = express();
const PORT = 3000;
const httpsApp = express();
const HTTPS_PORT = 3001;
const WORK_DIR = get_workdir();

// Create the zstd decompression middleware
const zstdMiddleware = (req, res, next) => {
  if (req.headers['content-encoding'] === 'zstd') {
    // check for DEBUG in environment variables
    if(process.env.DEBUG == "true") {
      console.log('zstdMiddleware: processing zstd request');
      console.log('zstdMiddleware: content-type:', req.headers['content-type']);
      console.log('zstdMiddleware: content-length:', req.headers['content-length']);
    }
    
    const chunks = [];
    let receivedLength = 0;
    
    req.on('data', (chunk) => {
      if(process.env.DEBUG == "true") {
        console.log('zstdMiddleware: received chunk, size:', chunk.length);
      }
      receivedLength += chunk.length;
      chunks.push(chunk);
    });
    
    req.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        if(process.env.DEBUG == "true") {
          console.log('zstdMiddleware: total buffer size:', buffer.length);
          console.log('zstdMiddleware: buffer (hex):', buffer.toString('hex'));
          console.log('zstdMiddleware: first 20 bytes:', buffer.slice(0, Math.min(20, buffer.length)));
        }
        
        const decompressed = zstd.decompress(buffer);
        if(process.env.DEBUG == "true") {
          console.log('zstdMiddleware: decompressed.');
        }

        if (req.is('application/msgpack')) {
          req.body = decode(decompressed);
          if(process.env.DEBUG == "true") {
            console.log('zstdMiddleware: decoded.');
          }
          next();
        } else {
          // Try to parse as JSON if it's JSON content
          try {
            req.body = JSON.parse(decompressed.toString());
          } catch {
            req.body = decompressed.toString();
          }
          next();
        }
      } catch (err) {
        console.error('zstdMiddleware: decompression failed:', err);
        res.status(400).json({message: 'zstd decompression failed', error: err.message});
      }
    });
    
    req.on('error', (err) => {
      console.error('zstdMiddleware: stream error:', err);
      if (!res.headersSent) {
        res.status(400).json({message: 'Request stream error'});
      }
    });
    
  } else {
    next();
  }
};

// Apply zstd middleware FIRST for app
app.use(zstdMiddleware);

// Middleware to serve static files from 'frontend' folder
app.use(express.static(path.join(WORK_DIR, "./frontend")));
app.use(express.json({limit: '10mb'}));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.text());
app.use(compression());
app.use(auth);
// middleware 
httpsApp.use(zstdMiddleware);
httpsApp.use(express.static(path.join(WORK_DIR, "./frontend")));
httpsApp.use(express.json({limit: '10mb'}));
httpsApp.use(express.urlencoded({ limit: '10mb', extended: true }));
httpsApp.use(express.text());
httpsApp.use(compression());

// function to validate otel json
function validate_otel_json(json) {
  const valid = validate(json);
  if(!valid) {
    console.error("Invalid OTEL JSON:" , validate.errors);
    return false;
  }
  console.log("valid OTEL JSON");
  return true;
}

// Backend API route
app.get("/api/message", (req, res) => {
  res.json({ message: "Hello from the backend!" });
});

// Serve the frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

var openai = null;
if(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY != "") {
  console.log("🔑 OPENAI_API_KEY is set.");
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  console.log("🧠 openai is set and ready.");
  if(ai_assistant_ws) {
    for(var key in ai_assistant_ws) {
      if(ai_assistant_ws[key]) {
        ai_assistant_ws[key].close();
        ai_assistant_ws[key] = null;
      }
    }
  }
}

// create http server for express app
const server = http.createServer(app);

// create https server for supporting refinery input
const httpsServer = https.createServer(get_https_options(), httpsApp);

// global variable for refinery output websocket
let refinery_out_ws = null;

// create websocket server for supporting refinery output
const wsRefineryServer = new WebSocketServer({ noServer: true });

// handle websocket connections
wsRefineryServer.on("connection", (ws, req) => {
  // console.log("A new ws client connected - refinery server output");
  refinery_out_ws = ws;
  // on message
  ws.on("message", (message) => {
    // do not do anything - we're not going to process the message
    if (message.toString() === "ping") {
      //console.log("refinery_out_ws: pong");
      ws.send("{{pong}}");
    }
  });

  // on close
  ws.on("close", () => {
    // console.log("wsRefineryServer: Websocket client disconnected.");
    refinery_out_ws = null;
  });
});

// global variable for otelcol output websocket
let otelcol_out_ws = null;

const wsOtelcolServer = new WebSocketServer({ noServer: true });
// handle websocket connections
wsOtelcolServer.on("connection", (ws, req) => {
  // console.log("A new ws client connected - otelcol server output");
  otelcol_out_ws = ws;
  // on message
  ws.on("message", (message) => {
    if (message.toString() === "ping") {
      //console.log("otelcol_out_ws: pong");
      ws.send("{{pong}}");
    }
  });

  // on close
  ws.on("close", () => {
    //console.log("wsOtelcolServer: Websocket client disconnected.");
    otelcol_out_ws = null;
  });
});

// global variable for otelcol standard output websocket
let otelcol_stdout_ws = null;
const wsOtelcolStdoutServer = new WebSocketServer({ noServer: true });
// handle websocket connections
wsOtelcolStdoutServer.on("connection", (ws, req) => {
  // console.log("A new ws client connected - otelcol stdoutput");
  otelcol_stdout_ws = ws;
  // on message
  ws.on("message", (message) => {
    if (message.toString() === "ping") {
      // console.log("otelcol_stdout_ws: pong");
      ws.send("{{pong}}");
    }
  });

  // on close
  ws.on("close", () => {
    //console.log("wsOtelcolStdoutServer: Websocket client disconnected.");
    otelcol_stdout_ws = null;
  });
});

// global variable for refinery standard output websocket
let refinery_stdout_ws = null;
const wsRefineryStdoutServer = new WebSocketServer({ noServer: true });
// handle websocket connections
wsRefineryStdoutServer.on("connection", (ws, req) => {
  // console.log("A new ws client connected - refinery stdoutput");
  refinery_stdout_ws = ws;
  // on message
  ws.on("message", (message) => {
    if (message.toString() === "ping") {
      //console.log("refinery_stdout_ws: pong");
      ws.send("{{pong}}");
    }
  });

  // on close
  ws.on("close", () => {
    //console.log("wsRefineryStdoutServer: Websocket client disconnected.");
    refinery_stdout_ws = null;
  });
});

// global variable for otelcol setup websocket
let otelcol_setup_ws = null;
const wsOtelcolSetupServer = new WebSocketServer({ noServer: true });
wsOtelcolSetupServer.on("connection", (ws, req) => {
  // console.log("A new ws client connected - otelcol setup");
  otelcol_setup_ws = ws;
  // on message
  ws.on("message", (message) => {
    // console.log("otelcol_setup_ws: message received");
    if(message.toString() === "ping") {
      //console.log("otelcol_setup_ws: pong");
      ws.send("{{pong}}");
    }
  });
});

// global variable for refinery setup websocket
let refinery_setup_ws = null;
const wsRefinerySetupServer = new WebSocketServer({ noServer: true });
wsRefinerySetupServer.on("connection", (ws, req) => {
  // console.log("A new ws client connected - refinery setup");
  refinery_setup_ws = ws;
  // on message
  ws.on("message", (message) => {
    // console.log("refinery_setup_ws: message received");
    if(message.toString() === "ping") {
      // console.log("refinery_setup_ws: pong");
      ws.send("{{pong}}");
    }
  });
});

// global variable for MCP activity websocket - broadcasts MCP actions to UI
let mcp_activity_ws = null;

// Output buffers to store the latest otelcol and refinery outputs for MCP access
const MAX_OUTPUT_BUFFER_SIZE = 50; // Maximum number of outputs to store
const otelcolOutputBuffer = [];
const refineryOutputBuffer = [];

/**
 * Store output in otelcol buffer
 */
function storeOtelcolOutput(type, data) {
  const output = {
    type,
    data: typeof data === 'string' ? JSON.parse(data.trim()) : data,
    timestamp: new Date().toISOString()
  };
  otelcolOutputBuffer.unshift(output); // Add to front
  if (otelcolOutputBuffer.length > MAX_OUTPUT_BUFFER_SIZE) {
    otelcolOutputBuffer.pop(); // Remove oldest
  }
}

/**
 * Store output in refinery buffer
 */
function storeRefineryOutput(type, data) {
  const output = {
    type,
    data: typeof data === 'string' ? JSON.parse(data.trim()) : data,
    timestamp: new Date().toISOString()
  };
  refineryOutputBuffer.unshift(output); // Add to front
  if (refineryOutputBuffer.length > MAX_OUTPUT_BUFFER_SIZE) {
    refineryOutputBuffer.pop(); // Remove oldest
  }
}

/**
 * Get latest otelcol outputs
 */
export function getLatestOtelcolOutputs(count = 10) {
  return otelcolOutputBuffer.slice(0, Math.min(count, otelcolOutputBuffer.length));
}

/**
 * Get latest refinery outputs
 */
export function getLatestRefineryOutputs(count = 10) {
  return refineryOutputBuffer.slice(0, Math.min(count, refineryOutputBuffer.length));
}

/**
 * Clear otelcol output buffer
 */
export function clearOtelcolOutputBuffer() {
  otelcolOutputBuffer.length = 0;
}

/**
 * Clear refinery output buffer
 */
export function clearRefineryOutputBuffer() {
  refineryOutputBuffer.length = 0;
}

// Console output buffers to store stdout/stderr from otelcol and refinery for MCP access
const MAX_CONSOLE_BUFFER_LINES = 500; // Maximum number of lines to store
const otelcolConsoleBuffer = [];
const refineryConsoleBuffer = [];

/**
 * Store console output line in otelcol buffer
 */
export function storeOtelcolConsoleOutput(data) {
  const lines = data.toString().split('\n').filter(line => line.trim() !== '');
  const timestamp = new Date().toISOString();
  for (const line of lines) {
    otelcolConsoleBuffer.push({
      line,
      timestamp
    });
    if (otelcolConsoleBuffer.length > MAX_CONSOLE_BUFFER_LINES) {
      otelcolConsoleBuffer.shift(); // Remove oldest
    }
  }
}

/**
 * Store console output line in refinery buffer
 */
export function storeRefineryConsoleOutput(data) {
  const lines = data.toString().split('\n').filter(line => line.trim() !== '');
  const timestamp = new Date().toISOString();
  for (const line of lines) {
    refineryConsoleBuffer.push({
      line,
      timestamp
    });
    if (refineryConsoleBuffer.length > MAX_CONSOLE_BUFFER_LINES) {
      refineryConsoleBuffer.shift(); // Remove oldest
    }
  }
}

/**
 * Get latest otelcol console output (tail)
 * @param {number} lines - Number of lines to retrieve from the end
 */
export function getOtelcolConsoleOutput(lines = 100) {
  const start = Math.max(0, otelcolConsoleBuffer.length - lines);
  return {
    lines: otelcolConsoleBuffer.slice(start),
    total: otelcolConsoleBuffer.length,
    returned: Math.min(lines, otelcolConsoleBuffer.length)
  };
}

/**
 * Get otelcol console output with pagination
 * @param {number} page - Page number (1-based)
 * @param {number} pageSize - Lines per page
 */
export function getOtelcolConsoleOutputPaginated(page = 1, pageSize = 50) {
  const totalPages = Math.ceil(otelcolConsoleBuffer.length / pageSize);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  return {
    lines: otelcolConsoleBuffer.slice(start, end),
    page,
    pageSize,
    totalLines: otelcolConsoleBuffer.length,
    totalPages,
    hasMore: page < totalPages
  };
}

/**
 * Get latest refinery console output (tail)
 * @param {number} lines - Number of lines to retrieve from the end
 */
export function getRefineryConsoleOutput(lines = 100) {
  const start = Math.max(0, refineryConsoleBuffer.length - lines);
  return {
    lines: refineryConsoleBuffer.slice(start),
    total: refineryConsoleBuffer.length,
    returned: Math.min(lines, refineryConsoleBuffer.length)
  };
}

/**
 * Get refinery console output with pagination
 * @param {number} page - Page number (1-based)
 * @param {number} pageSize - Lines per page
 */
export function getRefineryConsoleOutputPaginated(page = 1, pageSize = 50) {
  const totalPages = Math.ceil(refineryConsoleBuffer.length / pageSize);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  return {
    lines: refineryConsoleBuffer.slice(start, end),
    page,
    pageSize,
    totalLines: refineryConsoleBuffer.length,
    totalPages,
    hasMore: page < totalPages
  };
}

/**
 * Clear otelcol console buffer
 */
export function clearOtelcolConsoleBuffer() {
  otelcolConsoleBuffer.length = 0;
}

/**
 * Clear refinery console buffer
 */
export function clearRefineryConsoleBuffer() {
  refineryConsoleBuffer.length = 0;
}

/**
 * Search console output for patterns (useful for error detection)
 * @param {string} source - 'otelcol' or 'refinery'
 * @param {string} pattern - String or regex pattern to search for
 * @param {boolean} caseSensitive - Whether to use case-sensitive matching
 */
export function searchConsoleOutput(source, pattern, caseSensitive = false) {
  const buffer = source === 'otelcol' ? otelcolConsoleBuffer : refineryConsoleBuffer;
  const regex = new RegExp(pattern, caseSensitive ? '' : 'i');
  const matches = [];
  
  for (let i = 0; i < buffer.length; i++) {
    if (regex.test(buffer[i].line)) {
      matches.push({
        index: i,
        ...buffer[i]
      });
    }
  }
  
  return {
    matches,
    matchCount: matches.length,
    totalLines: buffer.length,
    pattern
  };
}

const wsMcpActivityServer = new WebSocketServer({ noServer: true });
wsMcpActivityServer.on("connection", (ws, req) => {
  console.log("A new ws client connected - MCP activity");
  mcp_activity_ws = ws;
  // on message
  ws.on("message", (message) => {
    if(message.toString() === "ping") {
      ws.send("{{pong}}");
    }
  });
  // on close
  ws.on("close", () => {
    console.log("MCP activity websocket client disconnected.");
    mcp_activity_ws = null;
  });
});

// create websocket server
const wss = new WebSocketServer({ noServer: true });

// map of web sockets for ai assistant
var ai_assistant_ws = {};

// routing for websocket upgrade
server.on("upgrade", (request, socket, head) => {
  const { url } = request;
  if ( url === "/ws" || url === "/ws/" ) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else if ( url === "/refinery_out" || url === "/refinery_out/" ) {
    wsRefineryServer.handleUpgrade(request, socket, head, (ws) => {
      wsRefineryServer.emit("connection", ws, request);
    });
  } else if ( url === "/otelcol_out" || url === "/otelcol_out/" ) {
    wsOtelcolServer.handleUpgrade(request, socket, head, (ws) => {
      wsOtelcolServer.emit("connection", ws, request);
    });
  } else if ( url === "/otelcol_stdout" || url === "/otelcol_stdout/" ) {
    wsOtelcolStdoutServer.handleUpgrade(request, socket, head, (ws) => {
      wsOtelcolStdoutServer.emit("connection", ws, request);
    });
  } else if ( url === "/refinery_stdout" || url === "/refinery_stdout/" ) {
    wsRefineryStdoutServer.handleUpgrade(request, socket, head, (ws) => {
      wsRefineryStdoutServer.emit("connection", ws, request);
    });
  } else if ( url === "/otelcol_setup" || url === "/otelcol_setup/" ) {
    wsOtelcolSetupServer.handleUpgrade(request, socket, head, (ws) => {
      wsOtelcolSetupServer.emit("connection", ws, request);
    });
  } else if ( url === "/refinery_setup" || url === "/refinery_setup/" ) {
    wsRefinerySetupServer.handleUpgrade(request, socket, head, (ws) => {
      wsRefinerySetupServer.emit("connection", ws, request);
    });
  } else if ( url === "/mcp_activity" || url === "/mcp_activity/" ) {
    wsMcpActivityServer.handleUpgrade(request, socket, head, (ws) => {
      wsMcpActivityServer.emit("connection", ws, request);
    });
  } else if ( url.startsWith("/ai_assistant") ) {
    // need to parse the url to get the id_prefix
    if(request.url.includes("?")) {
      var id_prefix = request.url.split("?")[1].split("=")[1];
    } else {
      var id_prefix = null;
    }
    if(id_prefix) {
      const _wss = new WebSocketServer({ noServer: true });
      _wss.on("connection", (ws, req) => {
        ai_assistant_ws[id_prefix] = ws;
        // on message
        ws.on("message", (message) => {
          if (message.toString() === "ping") {
            ai_assistant_ws[id_prefix].send("{{pong}}");
            // ws.send("{{pong}}");
          } else {
            /**
             * non-pong message is JSON array of messages
             * which looks like the following:
             * [
             *  {
             *    "role": "system",
             *    "content": "You are a helpful assistant."
             *  },
             *  {
             *    "role": "user",
             *    "content": "Hello, how are you?"
             *  }
             * ]
             */
            var messages = JSON.parse(message.toString());
            ai_assistant_send_message(ai_assistant_ws[id_prefix], messages);
          }
        });
      
        // on close
        ws.on("close", () => {
          ai_assistant_ws[id_prefix] = null;
        });

        ws.on("error", (err) => {
          console.log("ai assistant ws for " + id_prefix + " error: " + err.message);
          ai_assistant_ws[id_prefix] = null;
        });
      });

      _wss.handleUpgrade(request, socket, head, (ws) => {
        _wss.emit("connection", ws, request);
      });
    }
  } 
  else {
    socket.destroy();
  }
});

/**
 * utilize the openai api to send the message to the ai assistant
 * @param {*} id_prefix 
 * @param {*} messages 
 */
async function ai_assistant_send_message(ws, messages) {
  if(ws) {
    try {
      var model = process.env.OPENAI_MODEL || "gpt-4o-mini";
      const stream = await openai.chat.completions.create({
        // this should change depending on the model (e.g. gpt-4o, gpt-4o-mini, etc.)
        // model: "gpt-4o",
        model: model,
        messages: messages,
        stream: true
      });
      ws.send("{{start}}");
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || "";
        // console.log("text> " + text);
        ws.send(text);
      }
      // send the complete signal
      ws.send("{{end}}");
    } catch (err) {
      console.log(err.message);
      ws.send("{{errorstart}}")
      ws.send("An error occurred while generating the response.");
      ws.send("{{errorend}}")
    }
  }
}

// get otelcol versions available
app.get("/api/otelcol_versions", (req, res) => {
  get_otelcol_versions().then(versions => {
    res.json(versions);
  }).catch(err => {
    console.log(err.message);
    res.status(500).send({result: false, message: "Failed to get otelcol versions", error: err.toString()});
  });
});

// get refinery versions available
app.get("/api/refinery_versions", (req, res) => {
  get_refinery_versions().then(versions => {
    res.json(versions);
  }).catch(err => {
    console.log(err.message);
    res.status(500).send({result: false, message: "Failed to get refinery versions", error: err.toString()});
  });
});

// get the otelcol version that is currently installed
app.get("/api/otelcol_version", (req, res) => {
  var otelcollector = get_config().otel_collector;
  var command_line = otelcollector.bin_path + " --version";
  const [command, ...args] = command_line.split(" ");
  const childProcess = spawn(command, args);
  try {
    childProcess.stdout.on("data", (data) => {
      res.json({result: true, version: data.toString()});
    });
  } catch (err) {
    console.log(err.message);
    res.status(500).send({result: false, message: "Failed to get current otelcol version", error: err.toString()});
  }
});

// get the refinery version that is currently installed
app.get("/api/refinery_version", (req, res) => {
  var refinery = get_config().refinery;
  var command_line = refinery.bin_path + " --version";
  const [command, ...args] = command_line.split(" ");
  const childProcess = spawn(command, args);
  try {
    childProcess.stdout.on("data", (data) => {
      res.json({result: true, version: data.toString()});
    });
  } catch (err) {
    console.log(err.message);
    res.status(500).send({result: false, message: "Failed to get current refinery version", error: err.toString()});
  }
});

// start the otelcol process
app.get("/api/otelcol_start", (req, res) => {
  var config = get_config();
  var otelcollector = get_config().otel_collector;
  var command_line = otelcollector.bin_path + " --config=file:" + otelcollector.config_path;
  const [command, ...args] = command_line.split(" ");
  try {
    const childProcess = spawn(command, args);
    // get pid of the child process
    var pid = childProcess.pid;
    childProcess.stdout.on("data", (data) => {
      storeOtelcolConsoleOutput(data); // Store in buffer for MCP access
      if (otelcol_stdout_ws) {
        otelcol_stdout_ws.send(data.toString());
      }
    });
    childProcess.stderr.on("data", (data) => {
      storeOtelcolConsoleOutput(data); // Store in buffer for MCP access
      if (otelcol_stdout_ws) {
        // console.log("otelcol stderr >>>> " + data.toString());
        otelcol_stdout_ws.send(data.toString());
      }
    });
    childProcess.on("close", (code) => {
      const exitMsg = "[EXIT] otelcol exited with code " + code + "\n";
      storeOtelcolConsoleOutput(exitMsg); // Store in buffer for MCP access
      if (otelcol_stdout_ws) {
        otelcol_stdout_ws.send(exitMsg);
      }
    });
    childProcess.on("error", (err) => {
      const errorMsg = "[ERROR] " + err.toString() + "\n";
      storeOtelcolConsoleOutput(errorMsg); // Store in buffer for MCP access
      if (otelcol_stdout_ws) {
        otelcol_stdout_ws.send(errorMsg);
      }
    });
    res.status(200).send({result: true, pid: pid, message: "otelcol started successfully"});
  } catch (err) {
    console.log(err.message);
    res.status(500).send({result: false, message: "Failed to start otelcol", error: err.toString()});
  }
});

// start the refinery process
app.get("/api/refinery_start", (req, res) => {
  var refinery = get_config().refinery;
  var command_line = refinery.bin_path + " --config=" + refinery.config_path + " --rules_config=" + refinery.rule_path + " -d";
  const [command, ...args] = command_line.split(" ");
  try {
    const childProcess = spawn(command, args);
    // get pid of the child process
    var pid = childProcess.pid;
    childProcess.stdout.on("data", (data) => {
      storeRefineryConsoleOutput(data); // Store in buffer for MCP access
      if (refinery_stdout_ws) {
        refinery_stdout_ws.send(data.toString());
      }
    });
    childProcess.stderr.on("data", (data) => {
      storeRefineryConsoleOutput(data); // Store in buffer for MCP access
      if (refinery_stdout_ws) {
        refinery_stdout_ws.send(data.toString());
      }
    });
    childProcess.on("close", (code) => {
      const exitMsg = "[EXIT] refinery exited with code " + code;
      storeRefineryConsoleOutput(exitMsg); // Store in buffer for MCP access
      if (refinery_stdout_ws) {
        refinery_stdout_ws.send(exitMsg);
      }
    });
    childProcess.on("error", (err) => {
      const errorMsg = "[ERROR] " + err.toString();
      storeRefineryConsoleOutput(errorMsg); // Store in buffer for MCP access
      if (refinery_stdout_ws) {
        refinery_stdout_ws.send(errorMsg);
      }
    });
    res.status(200).send({result: true, pid: pid, message: "refinery started successfully"});
  } catch (err) {
    console.log(err.message);
    res.status(500).send({result: false, message: "Failed to start refinery", error: err.toString()});
  }
});

// save the yaml provided in the request body to the given path
app.post("/api/save_yaml", (req, res) => {
  var path = req.query["path"];
  var yaml = req.body;
  save_yaml(path, yaml);
  res.json({message: "yaml saved successfully"});
});

// retrieve the yaml file from the given path
app.get("/api/get_yaml", (req, res) => {
  var path = req.query["path"];
  var yaml = read_yaml(path);
  res.setHeader("Content-Type", "application/yaml");
  res.send(yaml);
});

// get the json provided in the request body to the given path
app.post("/api/save_json", (req, res) => {
  var path = req.query["path"];
  var json = req.body;
  save_json(path, json);
  res.json({message: "json saved successfully"});
});

// get the json file from the given path
app.get("/api/get_json", (req, res) => {
  var path = req.query["path"];
  var json = read_json(path);
  res.setHeader("Content-Type", "application/json");
  res.json(json);
});

// get the markdown file using the url, and output as the input.
app.get("/api/get_markdown", (req, res) => {
  var url = req.query["url"];
  var output = req.query["output"];
  try {
  fetch(url).then(response => {
      response.text().then(text => {
        //
        if(output && output == "html") {
          res.setHeader("Content-Type", "text/html");
          res.send(marked(text));
        } else {
          res.setHeader("Content-Type", "text/markdown");
          res.send(text);
        }
      });
    });
  } catch (err) {
    console.log(err.message);
    res.status(500).send({result: false, message: "Failed to get markdown", error: err.toString()});
  }
});

// check if the ai assistant is enabled
app.get("/api/ai_assistant", (req, res) => {
  if (openai) {
    res.json({result: true, type: "openai", message: "ai assistant is enabled"});
  } else {
    res.json({result: false, type: "openai", message: "ai assistant is disabled"});
  }
});

// get the list of modules for the most recent otelcol from github
app.get("/api/otelcol_modules", async (req, res) => {
  var version = "heads/main";
  if(req.query["version"]) {
    version = `tags/v${req.query["version"]}`;
  }
  const url = `https://raw.githubusercontent.com/open-telemetry/opentelemetry-collector-contrib/refs/${version}/versions.yaml`;
  var yaml = await read_yaml_from_url(url);
  // iterate over the yaml and get the list of modules
  const module_list = yaml['module-sets']['contrib-base']['modules'];
  var response = {};
  response['version'] = yaml['module-sets']['contrib-base']['version'];
  for(var module of module_list) {
    // parse the module name and get the last /*/* part
    const module_name_array = module.split('/');
    if(module_name_array.length == 5) {
      if(response[module_name_array[3]] == null) {
        response[module_name_array[3]] = [];
      }
      response[module_name_array[3]][response[module_name_array[3]].length] = module_name_array[4];
    }
  }
  res.setHeader("content-type", "application/json");
  res.json(response);
});


// internal function to send the otel json
// returns the array of messages that contains the result of the operation
async function send_otel_json(url, headers, json) {
  // first, get the total number of resources
  var total = 0;
  var processed = 0;
  if(json.resourceSpans) total++;
  if(json.resourceMetrics) total++;
  if(json.resourceLogs) total++;
  var result = [];

  if(total == 0) {
    return {result: [{error: true, message: "No resourceSpans, resourceMetrics, or resourceLogs found"}], total: 0, processed: 0};
  }

  // then send the resource one by one.
  if(json.resourceSpans) {
    // create a new json object
    var _json = {};
    var _result = {};
    _json.resourceSpans = json.resourceSpans;
    var url_to_use = url;
    if ( !url.endsWith('/v1/traces') ) {
      url_to_use += '/v1/traces';
    }
    if(validate_otel_json(_json)) {
      _result['validation'] = true;
      try {
        const response = await fetch(url_to_use, {
          method: 'POST',
          body: JSON.stringify(_json),
          headers: headers
        });
        if (response.status === 200) {
          processed++;
          _result['error'] = false;
          _result['sent'] = true;
          _result['message'] = "Traces sent successfully";
          result.push(_result);
        } else {
          _result['error'] = true;
          _result['sent'] = false;
          _result['message'] = "Failed to send traces";
          _result['error_message'] = response.statusText;
          result.push(_result);
        }
      } catch (err) {
        _result['sent'] = false;
        _result['error'] = true;
        _result['message'] = "Failed to send traces";
        _result['error_message'] = err.toString();
        result.push(_result);
      }
    } else {
      _result['validation'] = false;
      _result['sent'] = false;
      _result['error'] = true;
      _result['message'] = "Invalid OTEL JSON";
      _result['errors'] = validate.errors;
      result.push(_result);
    }
  }
  if(json.resourceMetrics) {
    var _json = {};
    var _result = {};
    _json.resourceMetrics = json.resourceMetrics;
    var url_to_use = url;
    if ( !url.endsWith('/v1/metrics') ) {
      url_to_use += '/v1/metrics';
    }
    if(validate_otel_json(_json)) {
      _result['validation'] = true;
      try {
        const response = await fetch(url_to_use, {
          method: 'POST',
          body: JSON.stringify(_json),
          headers: headers
        });
        if (response.status === 200) {
          processed++;
          _result['error'] = false;
          _result['sent'] = true;
          _result['message'] = "Metrics sent successfully";
          result.push(_result);
        } else {
          _result['error'] = true;
          _result['sent'] = false;
          _result['message'] = "Failed to send metrics";
          _result['error_message'] = response.statusText;
          result.push(_result);
        }
      } catch (err) {
        _result['sent'] = false;
        _result['error'] = true;
        _result['message'] = "Failed to send metrics";
        _result['error_message'] = err.toString();
        result.push(_result);
      }
    } else {
      _result['validation'] = false;
      _result['sent'] = false;
      _result['error'] = true;
      _result['message'] = "Invalid OTEL JSON";
      _result['errors'] = validate.errors;
      result.push(_result);
    }
  }
  if(json.resourceLogs) {
    var _json = {};
    var _result = {};
    _json.resourceLogs = json.resourceLogs;
    var url_to_use = url;
    if ( !url.endsWith('/v1/logs') ) {
      url_to_use += '/v1/logs';
    }
    if(validate_otel_json(_json)) {
      _result['validation'] = true;
      try {
        const response = await fetch(url_to_use, {
          method: 'POST',
          body: JSON.stringify(_json),
          headers: headers
        });
        if (response.status === 200) {
          processed++;
          _result['error'] = false;
          _result['sent'] = true;
          _result['message'] = "Logs sent successfully";
          result.push(_result);
        } else {
          _result['error'] = true;
          _result['sent'] = false;
          _result['message'] = "Failed to send logs";
          _result['error_message'] = response.statusText;
          result.push(_result);
          }
      } catch (err) {
        _result['sent'] = false;
        _result['error'] = true;
        _result['message'] = "Failed to send logs";
        _result['error_message'] = err.toString();
        result.push(_result);
      }
    } else {
      _result['validation'] = false;
      _result['sent'] = false;
      _result['error'] = true;
      _result['message'] = "Invalid OTEL JSON";
      _result['errors'] = validate.errors;  
      result.push(_result);
    }
  }
  return {result: result, total: total, processed: processed};
}

// get the json provided in the request body and submit it to 
// the url given
app.post("/api/send_json", async (req, res) => {
  var url = req.query["url"];
  var json = req.body;
  var headers = {};
  // copy the headers from the request headers
  for(var header in req.headers) {
    if(
      header.toLowerCase() != "accept-encoding" && 
      header.toLowerCase() != "accept-language" &&
      header.toLowerCase() != "content-length" &&
      header.toLowerCase() != "content-type"
    ) {
      headers[header] = req.headers[header];
    }
  }
  headers['Content-Type'] = 'application/json';
  if(req.headers['x-honeycomb-team']) {
    headers['x-honeycomb-team'] = req.headers['x-honeycomb-team'];
  }
  if(req.headers['x-honeycomb-dataset']) {
    headers['x-honeycomb-dataset'] = req.headers['x-honeycomb-dataset'];
  }
  console.log("headers", headers);
  if(Array.isArray(json)) {
    try {
      var total = 0;
      var processed = 0;
      var results = [];
      
      // Process each item sequentially
      for(var j of json) {
        var result = await send_otel_json(url, headers, j);
        total += result.total;
        processed += result.processed;
        // push array of results into result
        results = results.concat(result.result);
      }
      var status_icon = "✅";
      if (processed > 0 && total > 0 && processed != total) {
        status_icon = "⚠️";
      }
      if (processed == 0 && total == 0) {
        status_icon = "❌";
      }
      res.json({message: `${status_icon} JSON sent: (${processed}/${total})`, result: results});
    } catch (error) {
      console.error('Error sending json:', error);
      res.status(500).json({error: true, message: "❌ Failed to send json"});
    }
  } else {
    try {
      var results = await send_otel_json(url, headers, json);
      res.json({message: `✅ JSON sent: (${results.processed}/${results.total})`, result: results.result});
    } catch (error) {
      console.error('Error sending json:', error);
      res.status(500).json({error: true, message: "❌ Failed to send json"});
    }
  }
});

// list the saved json files in the saved directory
// response output in json format
app.get("/api/list_saved_json", (req, res) => {
  var config = get_config();
  // read only *.json files
  var files = readdirSync(config.work_dir + "/saved");
  var json_files = files.filter(file => file.endsWith(".json"));
  // remove the .json extension from the file name
  json_files = json_files.map(file => file.replace(".json", ""));
  res.json(json_files);
});

/**
 * get the saved json file.
 * the file name is given in the query parameter.
 * Please omit the extension json from the file name.
 */
app.get("/api/get_saved_json", (req, res) => {
  var config = get_config();
  var file = req.query["name"].replace("..", "");
  var json = read_json(config.work_dir + "/saved/" + file + ".json");
  res.json(json);
});

/**
 * delete the saved json file.
 * the file name is given in the query parameter.
 * Please omit the extension json from the file name.
 */
app.get("/api/delete_saved_json", (req, res) => {
  var config = get_config();
  var file = req.query["name"].replace("..", "");
  unlinkSync(config.work_dir + "/saved/" + file + ".json");
  res.json({message: "JSON data deleted successfully"});
});

/**
 * save the json data to the saved json file.
 * the file name is given in the query parameter.
 * Please omit the extension json from the file name.
 */
app.post("/api/save_saved_json", (req, res) => {
  var config = get_config();
  var file = req.query["name"].replace("..", "");
  // remove the blank spaces from the file name, with '_'
  file = file.replace(/\s+/g, '_').trim();
  var json = req.body;
  save_json(config.work_dir + "/saved/" + file + ".json", JSON.parse(json));
  res.json({message: "JSON data saved successfully"});
});

// retrieve the pids of running
// 1. otel collector
// 2. refinery
// if these processes are currently running. 
// results are returned as a list of lists, where each sublist contains the pid and the name of the process.
app.get("/api/pids", (req, res) => {
  res.json(get_pids());
});

// refresh the process with the given pid
// NOTE: as for refinery, the SIGUSER1 is deprecated and will not affect the process.
// looks like refinery has re-loading interval (10 seconds) and will reload the config automatically.
app.get("/api/refresh", (req, res) => {
  var pid = req.query["pid"];
  if(pid && check_pid(pid)) {
    var type = get_type(pid);
    if(type == "otelcol") {
      exec("kill -HUP " + pid, (err, stdout, stderr) => {
        if(err) {
          console.log(err.message);
          res.status(500).json({ error: "Failed to refresh process with pid " + pid });
        } else {
          res.json({ message: "refresh signal sent successfully" });
        }
      });
    } else if(type == "refinery") {
      exec("kill -USR1 " + pid, (err, stdout, stderr) => {
        if(err) {
          console.log(err.message);
          res.status(500).json({ error: "Failed to refresh process with pid " + pid });
        } else {
          res.json({ message: "refresh signal sent successfully" });
        }
      });
    } else {
      res.json({message: "invalid type of the process."});
    }
  }
  else {
    res.status(400).json({ error: "No valid pid provided" });
  }
});

// Send exit/stop message to console WebSocket (ensures UI shows feedback after refresh + stop)
function sendConsoleStopMessage(type, pid) {
  const msg = type === "otelcol"
    ? `[STOP] Stop signal sent to otelcol (pid ${pid}). Process is terminating.\n`
    : `[STOP] Stop signal sent to refinery (pid ${pid}). Process is terminating.\n`;
  const store = type === "otelcol" ? storeOtelcolConsoleOutput : storeRefineryConsoleOutput;
  const ws = type === "otelcol" ? otelcol_stdout_ws : refinery_stdout_ws;
  if (store) store(msg);
  if (ws && ws.readyState === 1) {
    try { ws.send(msg); } catch (e) { /* ignore */ }
  }
}

// stop the process with the given pid
app.get("/api/stop", (req, res) => {
  var pid = req.query["pid"];
  if(pid && check_pid(pid)) {
    var type = get_type(pid);
    if(type == "otelcol") {
      exec("kill -TERM " + pid, (err, stdout, stderr) => {
        if(err) {
          console.log(err.message);
          res.status(500).json({ error: "Failed to stop process with pid " + pid });
        } else {
          sendConsoleStopMessage("otelcol", pid);
          res.json({ message: "stop signal sent successfully", status: "success" });
        }
      });
    } else if(type == "refinery") {
      exec("kill -HUP " + pid, (err, stdout, stderr) => {
        if(err) {
          console.log(err.message);
          res.status(500).json({ error: "Failed to stop process with pid " + pid });
        } else {
          sendConsoleStopMessage("refinery", pid);
          res.json({ message: "stop signal sent successfully", status: "success" });
        }
      });
    } else {
      res.json({message: "invalid type of the process."});
    }
  }
  else {
    res.status(400).json({ error: "No valid pid provided" });
  }
});

// get the config
app.get("/api/config", (req, res) => {
  res.json(get_config());
});

// save the config
app.post("/api/config", (req, res) => {
  var config = req.body;
  save_config(config);
  res.json({message: "config saved successfully"});
});

// install the otelcol
app.get("/api/otelcol_install", (req, res) => {
  var version = req.query["version"];
  console.log("otelcol_install: ", version);
  install_otelcol(otelcol_setup_ws, version);
  res.json({started: true, message: "otelcol installation started"});
});

// install the refinery
app.get("/api/refinery_install", (req, res) => {
  var version = req.query["version"];
  console.log("refinery_install: ", version);
  install_refinery(refinery_setup_ws, version);
  res.json({started: true, message: "refinery installed started"});
});

// receive the otelcol output which is OTLP JSON on http
app.post("/v1/traces", (req, res) => {
  console.log("Received OTLP JSON - Traces");
  const output = JSON.stringify(req.body, null, 2) + "\n";
  // send the request body to the otelcol output websocket,
  // if the socket is connected.
  if(otelcol_out_ws) {
    otelcol_out_ws.send(output);
  }
  // Store in output buffer for MCP access
  storeOtelcolOutput('traces', req.body);
  // Forward to active MCP output collection tasks
  const activeTasks = getActiveOutputTasks('otelcol');
  for (const taskId of activeTasks) {
    captureOutputForTask(taskId, 'otlp_traces', output);
  }
  res.status(200).send();
});

// receive the otelcol output which is OTLP JSON on http
app.post("/v1/metrics", (req, res) => {
  console.log("Received OTLP JSON - Metrics");
  const output = JSON.stringify(req.body, null, 2) + "\n";

  // if the request is from otelteseter, send request body to refinery output websocket
  if(
    req.headers['x-request-from'] == 'oteltester'
  ) {
    if(refinery_out_ws) {
      // format the JSON string with indentations
      // add /n at the end of the string
      refinery_out_ws.send(output);
    }
    // Store in refinery output buffer for MCP access
    storeRefineryOutput('metrics', req.body);
    // Forward to active MCP refinery output collection tasks
    const activeTasks = getActiveOutputTasks('refinery');
    for (const taskId of activeTasks) {
      captureOutputForTask(taskId, 'otlp_metrics', output);
    }
  }
  else if(otelcol_out_ws) {
    otelcol_out_ws.send(output);
    // Store in otelcol output buffer for MCP access
    storeOtelcolOutput('metrics', req.body);
    // Forward to active MCP otelcol output collection tasks
    const activeTasks = getActiveOutputTasks('otelcol');
    for (const taskId of activeTasks) {
      captureOutputForTask(taskId, 'otlp_metrics', output);
    }
  }
  res.status(200).send();
});

// receive the otelcol output which is OTLP JSON on http
app.post("/v1/logs", (req, res) => {
  console.log("Received OTLP JSON - Logs");
  const output = JSON.stringify(req.body, null, 2) + "\n";
  // send the request body to the otelcol output websocket,
  // if the socket is connected.
  if(
    req.headers['x-request-from'] == 'oteltester'
  ) {
    if(refinery_out_ws) {
      // format the JSON string with indentations
      // add /n at the end of the string
      refinery_out_ws.send(output);
    }
    // Store in refinery output buffer for MCP access
    storeRefineryOutput('logs', req.body);
    // Forward to active MCP refinery output collection tasks
    const activeTasks = getActiveOutputTasks('refinery');
    for (const taskId of activeTasks) {
      captureOutputForTask(taskId, 'otlp_logs', output);
    }
  } else if(otelcol_out_ws) {
    otelcol_out_ws.send(output);
    // Store in otelcol output buffer for MCP access
    storeOtelcolOutput('logs', req.body);
    // Forward to active MCP otelcol output collection tasks
    const activeTasks = getActiveOutputTasks('otelcol');
    for (const taskId of activeTasks) {
      captureOutputForTask(taskId, 'otlp_logs', output);
    }
  }
  res.status(200).send();
});

// Start the normal server
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Websocket server running at ws://localhost:${PORT}/ws`);
  console.log(`MCP endpoint available at http://localhost:${PORT}/mcp`);
  initializeMCP();
});

/* ----------------------------------
   SERVER ROUTINE FOR HTTPS requests
   ---------------------------------- */

// Serve the frontend
httpsApp.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// need to create https endpoints /v1/auth wchich will
// have http header x-honeycomb-team that has value for api key
// result will be returned as json payload
// auth endpoint to validate honeycomb api key
// httpsApp.get("/1/auth", (req, res) => {
app.get("/1/auth", (req, res) => {
  const apiKey = req.header("x-honeycomb-team");
  console.log("/1/auth");
  // there is no need to use apiKey in any way,
  // so, no need to do anything
  
  if (!apiKey) {
    res.status(401).json({
      error: "unknown API key - check your credentials"
    });
    return;
  }

  // Return success response with empty JSON payload
  // This mimics Honeycomb's auth endpoint behavior
  res.json({
    id: "hcaik_01jhkk7zc245e3bpakcqzqg37x",
    type: "ingest",
    api_key_access: {
      events: true,
      markers: true,
      triggers: false,
      boards: false,
      queries: false,
      columns: false,
      createDatasets: true,
      slos: false,
      recipients: false,
      privateBoards: false
    },
    environment: {
      name: "output",
      slug: "output"
    },
    team: {
      name: "debug",
      slug: "debug"
    }
  });
});

// api endpoint /v1/events/{dataset}
// httpsApp.post("/1/events/:dataset", (req, res) => {
app.post("/1/events/:dataset", (req, res) => {  // Verify API key is present
  const dataset = req.params.dataset;
  console.log('Received Dataset:', dataset);
  // Verify API key is present
  const apiKey = req.header("x-honeycomb-team");
  if (!apiKey) {
    res.status(401).json({
      error: "Missing x-honeycomb-team header" 
    });
    return;
  }

  // console.log("reqbody", req.body);
  // Return success response with empty JSON payload
  // This mimics Honeycomb's events endpoint behavior
  res.status(200).send();
});

// api endpoint /v1/batch/{dataset}
// httpsApp.post("/1/batch/:dataset", (req, res) => {
app.post("/1/batch/:dataset", (req, res) => {
  const dataset = req.params.dataset;
  console.log('Received Dataset:', dataset);
  // Verify API key is present
  const apiKey = req.header("x-honeycomb-team");
  if (!apiKey) {
    res.status(401).json({
      error: "Missing x-honeycomb-team header" 
    });
    return;
  }

  // send the request body to the refinery output websocket,
  // if the socket is connected.
  const output = JSON.stringify(req.body, null, 2) + "\n";
  if(refinery_out_ws) {
    // format the JSON string with indentations
    // add /n at the end of the string
    refinery_out_ws.send(output);
  }
  // Forward to active MCP refinery output collection tasks
  const activeTasks = getActiveOutputTasks('refinery');
  for (const taskId of activeTasks) {
    captureOutputForTask(taskId, 'batch', output);
  }

  // Return one {status: 202} per event in the batch. The Honeycomb batch API
  // requires this - libhoney/Refinery expects N responses for N events.
  // Returning fewer causes "insufficient responses from server" errors.
  const events = Array.isArray(req.body) ? req.body : (req.body != null ? [req.body] : []);
  const responses = events.map(() => ({ status: 202 }));
  res.status(200).send(responses);
});

httpsApp.post("/v1/traces", (req, res) => {

  console.log("Received HTTP request - Traces");

  // Verify API key is present
  const apiKey = req.header("x-honeycomb-team");
  if (!apiKey) {
    res.status(401).json({
      error: "Missing x-honeycomb-team header" 
    });
    return;
  }

  // Verify content type is JSON
  if (req.get('Content-Type') !== 'application/json') {
    res.status(415).json({
      error: "Content-Type must be application/json"
    });
    return;
  }

  // request is coming in as JSON payload
  const jsonbody = req.body;

  // coutput jsonbody as string format
  console.log(JSON.stringify(jsonbody));

  // Return success response with empty JSON payload
  // This mimics Honeycomb's events endpoint behavior
  res.status(200).send();
});

httpsApp.post("/v1/metrics", (req, res) => {

  console.log("Received HTTP request - Metrics");

  // Verify API key is present
  const apiKey = req.header("x-honeycomb-team");
  if (!apiKey) {
    res.status(401).json({
      error: "Missing x-honeycomb-team header" 
    });
    return;
  }

  // Verify content type is JSON
  if (req.get('Content-Type') !== 'application/json') {
    res.status(415).json({
      error: "Content-Type must be application/json"
    });
    return;
  }

  // request is coming in as JSON payload
  const jsonbody = req.body;

  // coutput jsonbody as string format
  console.log(JSON.stringify(jsonbody));

  // Return success response with empty JSON payload
  // This mimics Honeycomb's events endpoint behavior
  res.status(200).send();
});

httpsApp.post("/v1/logs", (req, res) => {

  console.log("Received HTTP request - Logs");

  // Verify API key is present
  const apiKey = req.header("x-honeycomb-team");
  if (!apiKey) {
    res.status(401).json({
      error: "Missing x-honeycomb-team header" 
    });
    return;
  }

  // Verify content type is JSON
  if (req.get('Content-Type') !== 'application/json') {
    res.status(415).json({
      error: "Content-Type must be application/json"
    });
    return;
  }

  // request is coming in as JSON payload
  const jsonbody = req.body;

  // coutput jsonbody as string format
  console.log(JSON.stringify(jsonbody));

  // Return success response with empty JSON payload
  // This mimics Honeycomb's events endpoint behavior
  res.status(200).send();
});

// MCP endpoint - Model Context Protocol interface
app.post("/mcp", (req, res) => {
  handleMCPRequest(req, res);
});

// MCP task status endpoint for polling async operations
app.get("/mcp/tasks/:taskId", (req, res) => {
  const { taskId } = req.params;
  handleMCPRequest({
    body: {
      jsonrpc: '2.0',
      id: req.query.id || '1',
      method: 'tasks/get',
      params: { taskId }
    }
  }, res);
});

// Set up MCP WebSocket references after servers start
// This will be called after server.listen to ensure WebSocket refs are available
function initializeMCP() {
  setWebSocketRefs({
    otelcol_out_ws,
    refinery_out_ws,
    otelcol_stdout_ws,
    refinery_stdout_ws,
    otelcol_setup_ws,
    refinery_setup_ws,
    mcp_activity_ws,
    // Getter functions to get current WebSocket references (needed because MCP init runs before UI connects)
    getMcpActivityWs: () => mcp_activity_ws,
    getOtelcolStdoutWs: () => otelcol_stdout_ws,
    getRefineryStdoutWs: () => refinery_stdout_ws,
    // Output buffer accessors for MCP tools
    getLatestOtelcolOutputs,
    getLatestRefineryOutputs,
    clearOtelcolOutputBuffer,
    clearRefineryOutputBuffer,
    // Console output buffer accessors for MCP tools
    getOtelcolConsoleOutput,
    getOtelcolConsoleOutputPaginated,
    getRefineryConsoleOutput,
    getRefineryConsoleOutputPaginated,
    clearOtelcolConsoleBuffer,
    clearRefineryConsoleBuffer,
    searchConsoleOutput,
    // Console output store functions for MCP process handlers
    storeOtelcolConsoleOutput,
    storeRefineryConsoleOutput
  });
}

// https port listen
httpsServer.listen(HTTPS_PORT, () => {
  console.log(`HTTPS Server running at https://localhost:${HTTPS_PORT}`);
  initializeMCP();
});