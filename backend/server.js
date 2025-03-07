import express from "express";
import path from "path";
import { exec } from "child_process";
import { get_pids, check_pid, get_type, save_yaml, read_yaml, read_yaml_from_url, save_json, read_json } from "./utils.js";
import { get_config, save_config, get_workdir } from "./config.js";
import { get_https_options } from './security.js';
import { install_otelcol, install_refinery } from "./install.js";
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

// load the environment variables (automatically loads .env.local, .env, and .env.development)
dotenvFlow.config();

const app = express();
const PORT = 3000;
const httpsApp = express();
const HTTPS_PORT = 3001;
const WORK_DIR = get_workdir();

// Middleware to serve static files from 'frontend' folder
app.use(express.static(path.join(WORK_DIR, "./frontend")));
app.use(express.json({limit: '10mb'}));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.text());
app.use(compression());

// middleware to serve json payload as input
httpsApp.use(express.static(path.join(WORK_DIR, "./frontend")));
httpsApp.use(express.json({limit: '10mb'}));
httpsApp.use(express.urlencoded({ limit: '10mb', extended: true }));
httpsApp.use(express.text());
httpsApp.use(compression());

// Backend API route
app.get("/api/message", (req, res) => {
  res.json({ message: "Hello from the backend!" });
});

// Serve the frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

var openai = null;
if(process.env.OPENAI_API_KEY) {
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
        console.log("ai assistant ws for " + id_prefix + " connected.");
        ai_assistant_ws[id_prefix] = ws;
        // on message
        ws.on("message", (message) => {
          if (message.toString() === "ping") {
            console.log("ai assistant ws for " + id_prefix + " received ping.");
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
            // console.log("ai assistant ws for " + id_prefix + " received messages: " + JSON.stringify(messages));
            ai_assistant_send_message(ai_assistant_ws[id_prefix], messages);
          }
        });
      
        // on close
        ws.on("close", () => {
          console.log("ai assistant ws for " + id_prefix + " closed.");
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
      const stream = await openai.chat.completions.create({
        // this should change depending on the model (e.g. gpt-4o, gpt-4o-mini, etc.)
        // model: "gpt-4o",
        model: "gpt-4o-mini",
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
      if (otelcol_stdout_ws) {
        otelcol_stdout_ws.send(data.toString());
      }
    });
    childProcess.stderr.on("data", (data) => {
      if (otelcol_stdout_ws) {
        // console.log("otelcol stderr >>>> " + data.toString());
        otelcol_stdout_ws.send(data.toString());
      }
    });
    childProcess.on("close", (code) => {
      if (otelcol_stdout_ws) {
        otelcol_stdout_ws.send("[EXIT] otelcol exited with code " + code + "\n");
      }
    });
    childProcess.on("error", (err) => {
      if (otelcol_stdout_ws) {
        otelcol_stdout_ws.send("[ERROR] " + err.toString() + "\n");
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
      if (refinery_stdout_ws) {
        refinery_stdout_ws.send(data.toString());
      }
    });
    childProcess.stderr.on("data", (data) => {
      if (refinery_stdout_ws) {
        refinery_stdout_ws.send(data.toString());
      }
    });
    childProcess.on("close", (code) => {
      if (refinery_stdout_ws) {
        refinery_stdout_ws.send("[EXIT] refinery exited with code " + code);
      }
    });
    childProcess.on("error", (err) => {
      if (refinery_stdout_ws) {
        refinery_stdout_ws.send("[ERROR] " + err.toString());
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

// get the json provided in the request body and submit it to 
// the url given
app.post("/api/send_json", (req, res) => {
  var url = req.query["url"];
  var json = req.body;
  var headers = {};
  headers['Content-Type'] = 'application/json';
  // in case it contains honeycomb api key, forward it to the endpoint
  if(req.headers['x-honeycomb-team']) {
    headers['x-honeycomb-team'] = req.headers['x-honeycomb-team'];
  }
  
  // if json is array,
  if(Array.isArray(json)) {
    // iterate over the array and process them each
    for(var j of json) {
      if ( j.resourceSpans ) {
        if ( !url.endsWith('/v1/traces') ) {
          url += '/v1/traces';
        }
      } else if ( j.resourceMetrics ) {
        if ( !url.endsWith('/v1/metrics') ) {
          url += '/v1/metrics';
        }
      } else if ( j.resourceLogs ) {
        if ( !url.endsWith('/v1/logs') ) {
          url += '/v1/logs';
        }
      }
      console.log("send json url: " + url);
      headers['Content-Length'] = j.length;
      fetch(url, {
        method: 'POST',
        body: JSON.stringify(j),
        headers: headers
      })
      .then(response => {
        if (response.status === 200) {
          res.json({message: "✅ JSON sent successfully"});
        } else {
          res.status(response.status).json({error: true,message: "❌ Failed to send json"});
        }
      })
      .catch(error => {
        console.error('Error sending json:', error);
        res.status(500).json({error: true, message: "❌ Failed to send json"});
      });
    }
  } else {
    if ( json.resourceSpans ) {
      if ( !url.endsWith('/v1/traces') ) {
        url += '/v1/traces';
      }
    } else if ( json.resourceMetrics ) {
      if ( !url.endsWith('/v1/metrics') ) {
        url += '/v1/metrics';
      }
    } else if ( json.resourceLogs ) {
      if ( !url.endsWith('/v1/logs') ) {
        url += '/v1/logs';
      }
    }
    console.log("send json url: " + url);
    fetch(url, {
      method: 'POST',
      body: JSON.stringify(json),
      headers: headers
    })
    .then(response => {
      if (response.status === 200) {
        res.json({message: "✅ JSON sent successfully"});
      } else {
        res.status(response.status).json({error: true,message: "❌ Failed to send json"});
      }
    })
    .catch(error => {
      console.error('Error sending json:', error);
      res.status(500).json({error: true, message: "❌ Failed to send json"});
    });
  }
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
          res.json({ message: "stop signal sent successfully", status: "success" });
        }
      });
    } else if(type == "refinery") {
      exec("kill -HUP " + pid, (err, stdout, stderr) => {
        if(err) {
          console.log(err.message);
          res.status(500).json({ error: "Failed to stop process with pid " + pid });
        } else {
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
  // send the request body to the otelcol output websocket,
  // if the socket is connected.
  if(otelcol_out_ws) {
    otelcol_out_ws.send(JSON.stringify(req.body, null, 2) + "\n");
  }
  res.status(200).send();
});

// receive the otelcol output which is OTLP JSON on http
app.post("/v1/metrics", (req, res) => {
  console.log("Received OTLP JSON - Metrics");
  // send the request body to the otelcol output websocket,
  // if the socket is connected.
  if(otelcol_out_ws) {
    otelcol_out_ws.send(JSON.stringify(req.body, null, 2) + "\n");
  }
  res.status(200).send();
});

// receive the otelcol output which is OTLP JSON on http
app.post("/v1/logs", (req, res) => {
  console.log("Received OTLP JSON - Logs");
  // send the request body to the otelcol output websocket,
  // if the socket is connected.
  if(otelcol_out_ws) {
    otelcol_out_ws.send(JSON.stringify(req.body, null, 2) + "\n");
  }
  res.status(200).send();
});

// Start the normal server
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Websocket server running at ws://localhost:${PORT}/ws`);
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

// httpsApp.use((req, res, next) => {
app.use((req, res, next) => {
  if (req.headers['content-encoding'] === 'zstd') {
    const chunks = [];
    req.on('data', (chunk) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const decompressed = zstd.decompress(buffer);

      if (req.is('application/msgpack')) {
        try {
          req.body = decode(decompressed);
          next();
        } catch (err) {
          console.log(err.message);
          res.status(400).json({message: 'Invalid MessagePack Payload'});
          return;
        }
      }
    });
  } else {
    next();
  }
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
  if(refinery_out_ws) {
    // format the JSON string with indentations
    // add /n at the end of the string
    refinery_out_ws.send(JSON.stringify(req.body, null, 2) + "\n");
  }

  // Return success response with empty JSON payload
  // This mimics Honeycomb's events endpoint behavior
  res.status(200).send([{status: 202}]);
});

httpsApp.post("/v1/traces", (req, res) => {

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

// https port listen
httpsServer.listen(HTTPS_PORT, () => {
  console.log(`HTTPS Server running at https://localhost:${HTTPS_PORT}`);
});