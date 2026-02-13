# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**oteltester** is a web application for testing OpenTelemetry Collector and Honeycomb Refinery. It provides a UI for downloading, installing, configuring, and testing both tools, with support for sending OTEL JSON data (traces, metrics, logs) and monitoring outputs. The application also exposes an MCP (Model Context Protocol) interface for AI agent interaction.

## Running the Application

### Local Development
```bash
npm install
npm run dev        # Development mode with nodemon
npm start          # Production mode
```

Access the application at `http://localhost:3000/`

### Docker
```bash
./run.sh           # Start
./stop.sh          # Stop
```

The `./data` directory is mounted as `/app/data` in Docker, making it available to the tester.

### Environment Setup (Optional)
For LLM features, create `.env` or `.env.development`:
```
OPENAI_API_KEY=<your-key>
OPENAI_MODEL=<model-name>
```

### MacOS zstd Setup
Refinery uses zstd compression. If you encounter dylib errors:
```bash
brew install zstd
sudo ln -s /opt/homebrew/Cellar/zstd/1.5.x/lib/libzstd.1.5.x.dylib /usr/local/lib/libzstd.1.dylib
```

## Architecture

### Backend (`/backend`)
- **server.js**: Main Express server with HTTP/HTTPS endpoints, WebSocket handling, OTEL data processing
- **mcp.js**: Model Context Protocol implementation for AI agent integration
- **install.js**: Handles downloading and installing OpenTelemetry Collector and Refinery from GitHub
- **config.js**: Configuration management for `config.yaml`
- **utils.js**: Utilities for YAML/JSON conversion, process management
- **security.js**: HTTPS/TLS certificate handling
- **auth.js**: Basic authentication middleware
- **schema/**: JSON schema for OTEL data validation (using Ajv)

### Frontend (`/frontend`)
- **index.html**: Main UI
- **runtime.js**: Core frontend logic for WebSocket connections, process management, UI updates
- **main.js**: Additional UI logic
- **openai.js**: LLM integration for generating OTEL JSON and collector configs
- **editor.js**: Code editor integration
- **template.js**: Template management
- **dialog.js**: Dialog/modal handling
- Various HTML files for module configuration (receivers, processors, exporters, etc.)

### Key Directories
- **runtime/**: Installed binaries (otelcol-contrib, refinery) and their configs
- **templates/**: Example OTEL JSON templates (traces, metrics, logs)
- **saved/**: User-saved JSON configurations
- **data/**: Mounted volume for Docker, input data storage
- **certs/**: TLS certificates for HTTPS
- **examples/**: Example configurations

### Configuration
- **config.yaml**: Main config file storing:
  - Binary paths and versions
  - Config file paths (OTEL Collector, Refinery)
  - API endpoints and keys for sending data
  - Working directory and template paths
  - OS architecture/platform info

## Key Features

### OTEL Data Handling
- Supports traces, metrics, and logs in OpenTelemetry JSON format
- Can process multiple data types in a single request (non-standard but convenient)
- Supports both array format `[{...}, {...}]` and object format `{..., ..., ...}`
- Automatic trace/span ID regeneration with placeholder support (`{{trace.1}}`, `{{span.1}}`)
- Time normalization: relative timestamps (e.g., `1s`, `0.5ms`) are converted to absolute UNIX nanoseconds

### Process Management
- Spawns and monitors otelcol-contrib and refinery processes
- Real-time stdout/stderr capture via WebSockets
- Process discovery via `ps aux`
- Graceful process termination (SIGTERM for otelcol, SIGHUP for refinery)

### WebSocket Channels
- `/refinery_out`: Refinery OTLP output
- `/otelcol_out`: OTEL Collector output
- `/otelcol_stdout`: Collector stdout/stderr
- `/refinery_stdout`: Refinery stdout/stderr
- `/otelcol_setup`: Collector installation progress
- `/refinery_setup`: Refinery installation progress
- `/mcp_activity`: MCP activity notifications (real-time UI sync)

### MCP Interface
Endpoint: `POST http://localhost:3000/mcp`

The MCP interface exposes JSON-RPC 2.0 methods for:
- **Tools** (actions that modify state): Installing and managing binaries, starting/stopping processes, reading/writing configs, sending OTEL data, managing saved JSON files, retrieving and forwarding outputs, monitoring console logs
- **Resources** (read-only state access): System status, template discovery, endpoint information, parsed configurations, process lists, saved file listings, output buffers, console logs

Asynchronous operations return `taskId` and `taskUri` for polling status. See `MCP.md` for detailed API documentation.

#### MCP Tools
The MCP interface provides 37 tools across these categories:
- **Configuration Management**: get_config, save_config
- **Installation**: version checking, binary installation (async)
- **Process Management**: start, stop, refresh processes
- **File Operations**: read/write YAML and JSON files
- **Saved JSON Management**: list, get, save, delete saved configurations
- **Testing**: send OTEL JSON data (async)
- **Output Retrieval & Forwarding**: Get outputs from collector/refinery buffers, forward to targets (Honeycomb, other collectors, refinery)
- **Console Monitoring**: Get/search/paginate console logs, clear buffers
- **Module Information**: get available OTEL Collector modules

#### MCP Resources
Resources provide efficient read-only access to system state (16 total):

**System & Discovery:**
- `system://status` - Complete system state (installation, processes, endpoints)
- `templates://list` - Discover available OTEL templates
- `templates://<name>` - Template content with placeholder/time field metadata
- `endpoints://info` - HTTP/WebSocket endpoints
- `versions://available` - Available versions (cached 5 min)
- `modules://otelcol` - Available OTEL modules
- `schema://otel` - OTEL JSON schema

**Configuration:**
- `config://otelcol` - Parsed OTEL Collector config with pipeline structure
- `config://refinery` - Parsed Refinery config

**Runtime State:**
- `processes://list` - Enhanced process info with context
- `saved://list` - Saved JSON files with metadata
- `saved://<name>` - Saved JSON content with validation

**Output Buffers:**
- `output://otelcol/latest` - Latest outputs from OTEL Collector (up to 50)
- `output://refinery/latest` - Latest outputs from Refinery (up to 50)

**Console Logs:**
- `console://otelcol/latest` - Latest console output from OTEL Collector (200 lines)
- `console://refinery/latest` - Latest console output from Refinery (200 lines)

**Skills (AI Agent Guidance):**
- `skills://list` - List all available skill resources
- `skills://overview` - Executive overview of oteltester capabilities
- `skills://installation` - How to install and run different versions of Collector and Refinery
- `skills://configuration` - How to formulate YAML configs for both
- `skills://testing-workflow` - Submit OTLP JSON, monitor logs, re-submit to Refinery
- `skills://collector-verification` - How to verify Collector config correctness
- `skills://refinery-verification` - How to verify Refinery sampling rules
- `skills://honeycomb-forwarding` - How to send data to Honeycomb (requires API key from user)

Skills provide structured guidance for AI agents to learn oteltester workflows. Start with `skills://overview`.

Resources reduce AI agent tool calls by 50-75% and enable discovery patterns that weren't possible with tools alone.

## Important Implementation Details

### Middleware Order
The zstd decompression middleware (`zstdMiddleware`) **must** be applied first, before express.json(), to handle Refinery's compressed msgpack payloads.

### MCP-Server Integration
The MCP module (`mcp.js`) requires references to server resources (WebSockets, output buffers, console buffers) to function. These are injected via `setWebSocketRefs()` called from `server.js`:

```javascript
setWebSocketRefs({
  otelcol_out_ws, refinery_out_ws, otelcol_stdout_ws, refinery_stdout_ws,
  otelcol_setup_ws, refinery_setup_ws, mcp_activity_ws, getMcpActivityWs,
  getLatestOtelcolOutputs, getLatestRefineryOutputs,
  clearOtelcolOutputBuffer, clearRefineryOutputBuffer,
  getOtelcolConsoleOutput, getRefineryConsoleOutput,
  getOtelcolConsoleOutputPaginated, getRefineryConsoleOutputPaginated,
  clearOtelcolConsoleBuffer, clearRefineryConsoleBuffer, searchConsoleOutput,
  storeOtelcolConsoleOutput, storeRefineryConsoleOutput
});
```

This pattern allows MCP tools to access server state without circular dependencies.

### OTEL JSON Validation
OTEL JSON is validated using Ajv with schema at `backend/schema/otel-schema.json`. Invalid JSON logs errors but may still be processed.

### Installation Process
- Binaries are downloaded from GitHub releases (open-telemetry/opentelemetry-collector, honeycombio/refinery)
- tar.gz files are extracted to `runtime/`
- Versions are tracked in `config.yaml`
- Installation is async and reports progress via WebSocket

### Config Management
- OTEL Collector: `runtime/otelcol-config.yml`
- Refinery: `runtime/refinery-config.yml` and `runtime/refinery-rule.yml`
- Configs can be edited via UI and reloaded without restarting the app

### Environment Detection
The app detects GitHub Codespaces and Gitpod environments and adjusts `host_name` accordingly for proper WebSocket connections.

### Output and Console Buffers
The server maintains in-memory buffers for efficient output retrieval:
- **Output Buffers**: Store up to 50 outputs per source (otelcol/refinery). Each output includes type (traces/metrics/logs), data, and timestamp.
- **Console Buffers**: Store up to 500 lines of console output (stdout/stderr) per process. Each line includes timestamp and content.
- Buffers are accessible via MCP tools and resources for monitoring, debugging, and output forwarding.

### MCP Activity Broadcasting
When AI agents perform actions via MCP, these activities are automatically broadcast to connected browser UIs via the `/mcp_activity` WebSocket channel. This enables real-time monitoring of AI agent operations. Broadcast events include:
- **config_saved**: Configuration files updated
- **yaml_saved / json_saved**: Individual file saves
- **otel_data_submitting / otel_data_submitted**: OTEL data submission events
- **process_started / process_stopped / process_refreshed**: Process lifecycle events
- **output_forwarding / output_forwarded**: Output forwarding operations
- **output_buffer_cleared / console_buffer_cleared**: Buffer management operations

The `broadcastMcpActivity(action, data)` function in `mcp.js` handles all broadcasts.

## Working with the Code

### Adding New MCP Tools
1. Add tool definition in `mcp.js` `getToolDefinitions()` function
2. Implement handler in `executeTool()` switch statement
3. For async operations, use `createTask()` and `updateTask()`
4. For UI-visible operations, call `broadcastMcpActivity(action, data)` to notify connected browsers
5. For output buffer operations, use the accessor functions (getLatestOtelcolOutputs, clearOtelcolOutputBuffer, etc.) set via `setWebSocketRefs()`

### Adding New MCP Resources
1. Add resource definition to `handleResourcesList()` function
2. Add URI pattern matching in `handleResourcesRead()` function
3. Implement resource handler function (e.g., `getSystemStatusResource()`)
4. Return object with `uri`, `mimeType`, and `text` fields
5. For expensive operations (external APIs), use `getCachedResource()` and `setCachedResource()`

**Resource Handler Pattern:**
```javascript
async function getMyResource() {
  const data = { ... }; // Gather data
  return {
    uri: 'my://resource',
    mimeType: 'application/json',
    text: JSON.stringify(data, null, 2)
  };
}
```

**Caching Pattern:**
```javascript
async function getExpensiveResource() {
  const cached = getCachedResource('my://resource');
  if (cached) return cached;

  const data = await fetchExpensiveData();
  const resource = {
    uri: 'my://resource',
    mimeType: 'application/json',
    text: JSON.stringify(data, null, 2)
  };

  setCachedResource('my://resource', resource);
  return resource;
}
```

### Modifying OTEL Processing
The main OTEL sending logic is in `server.js` under `/api/otel` endpoint. It:
1. Validates JSON structure
2. Detects data type (trace/metric/log)
3. Normalizes timestamps
4. Regenerates IDs if requested
5. POSTs to the target endpoint

### Testing OTEL Data
Use the templates in `/templates` or saved configurations in `/saved` as starting points. The UI provides an editor with syntax highlighting and validation.

### Output Retrieval and Forwarding
AI agents can retrieve outputs from the collector/refinery buffers and forward them to other targets:

**Retrieval Pattern:**
```javascript
// Get latest outputs from buffer
const outputs = getLatestOtelcolOutputs(10); // Returns array of {type, data, timestamp}

// Access via MCP tool
get_latest_otelcol_output({ count: 10 })
```

**Forwarding Pattern:**
```javascript
// Forward to refinery
await forwardOtelcolOutputToRefinery(outputIndex, headers);

// Forward to any target
await forwardOutputToTarget('otelcol', 'https://api.honeycomb.io', outputIndex, headers);
```

**Common Use Cases:**
- Test refinery sampling rules with collector outputs
- Send test data to Honeycomb for validation
- Chain multiple collectors for pipeline testing
- Replay specific outputs for debugging

### Console Output Monitoring
Console output (stdout/stderr) from otelcol and refinery processes is captured and buffered:

**Monitoring Pattern:**
```javascript
// Get recent console output
const result = getOtelcolConsoleOutput(100); // Last 100 lines
// Returns: { lines: [{line, timestamp}], total, returned }

// Search for errors
const matches = searchConsoleOutput('otelcol', 'error|failed|warn', false);
// Returns: { matches: [{index, line, timestamp}], matchCount }

// Paginate through history
const page = getOtelcolConsoleOutputPaginated(1, 50); // Page 1, 50 lines
```

**Use Cases:**
- Debug process startup issues
- Monitor for errors and warnings
- Verify configuration changes took effect
- Track data flow through pipelines
