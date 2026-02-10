# MCP (Model Context Protocol) Interface

The oteltester service now exposes an MCP interface at `/mcp` that allows AI agents to interact with and control the oteltester functionality.

## Setup: Connecting MCP Clients

To use oteltester with MCP clients (such as Cursor, Claude Desktop, or other AI tools), add it to your MCP configuration.

### Prerequisites

1. **Start oteltester** – The application must be running (e.g. `npm run dev` or `npm start`).
2. **Default URL** – oteltester listens at `http://localhost:3000` by default.

### Configuration File Location

| Client | Configuration File |
|--------|-------------------|
| Cursor | `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project) |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Other | Consult your client's MCP documentation |

### Example mcp.json

Add `oteltester` to the `mcpServers` section:

```json
{
  "mcpServers": {
    "oteltester": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### Full Example (with other servers)

```json
{
  "mcpServers": {
    "oteltester": {
      "url": "http://localhost:3000/mcp"
    },
    "other-server": {
      "command": "node",
      "args": ["path/to/other-mcp-server.js"]
    }
  }
}
```

### Cursor-Specific Setup

1. Open **Cursor Settings** → **Features** → **MCP**
2. Click **+ Add New MCP Server**
3. Select **Streamable HTTP** (or **URL**) as the transport type
4. Enter:
   - **Name**: `oteltester`
   - **URL**: `http://localhost:3000/mcp`
5. Save and refresh the MCP server list

You can also edit `~/.cursor/mcp.json` directly with the JSON above.

### Custom Port or Host

If oteltester runs on a different host or port, adjust the URL accordingly:

```json
{
  "mcpServers": {
    "oteltester": {
      "url": "http://localhost:4000/mcp"
    }
  }
}
```

For HTTPS (when using the built-in certs), use `https://localhost:3001/mcp` (or the port shown at startup).

### Verification

After configuration:

1. Restart your MCP client or refresh the MCP server list
2. Ensure oteltester is running at the configured URL
3. In Cursor: check **MCP** settings for a green status next to `oteltester`
4. The Composer agent will have access to oteltester tools when relevant to your requests

## Overview

The MCP interface implements the Model Context Protocol specification, providing a standardized way for AI agents to:
- Install and manage OpenTelemetry Collector and Refinery
- Configure and deploy collector/refinery configurations
- Start/stop processes
- Send test data
- Monitor outputs asynchronously

## Endpoint

- **MCP Endpoint**: `POST http://localhost:3000/mcp`
- **Task Status**: `GET http://localhost:3000/mcp/tasks/:taskId`

## Protocol

The MCP interface uses JSON-RPC 2.0 protocol. All requests should include:
- `jsonrpc`: `"2.0"`
- `id`: Request identifier
- `method`: MCP method name
- `params`: Method parameters

## Available Methods

### Initialize
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {}
}
```

### List Tools
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

### Call Tool
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "tool_name",
    "arguments": {
      "param1": "value1"
    }
  }
}
```

### Get Task Status
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tasks/get",
  "params": {
    "taskId": "task_1_1234567890"
  }
}
```

Or via HTTP GET:
```
GET /mcp/tasks/task_1_1234567890
```

## MCP Resources

In addition to tools (which perform actions), the MCP interface exposes **resources** for read-only access to system state. Resources provide AI agents with efficient discovery and status information without multiple tool calls.

### List Resources
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "resources/list",
  "params": {}
}
```

### Read Resource
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "resources/read",
  "params": {
    "uri": "system://status"
  }
}
```

### Available Resources

#### System Status: `system://status`
Complete system state in a single call. Replaces multiple tool calls (get_config, get_pids, version checks).

**Example:**
```json
{
  "version": "1.0.0",
  "otelCollector": {
    "installed": true,
    "version": "0.142.0",
    "running": false,
    "pid": null,
    "configPath": "./runtime/otelcol-config.yml",
    "configExists": true
  },
  "refinery": {
    "installed": true,
    "version": "3.0.1",
    "running": false,
    "pid": null,
    "configPath": "./runtime/refinery-config.yml",
    "rulePath": "./runtime/refinery-rule.yml",
    "configExists": true,
    "ruleExists": true
  },
  "endpoints": {
    "otlpHttp": "http://localhost:4318",
    "otlpGrpc": "grpc://localhost:4317"
  },
  "system": {
    "architecture": "arm64",
    "platform": "darwin",
    "is64bit": true
  }
}
```

#### Templates List: `templates://list`
Discover all available OTEL JSON templates with metadata.

**Example:**
```json
{
  "templates": [
    {
      "name": "simple_trace",
      "path": "./templates/simple_trace.json",
      "type": "trace",
      "uri": "templates://simple_trace"
    },
    {
      "name": "simple_log",
      "path": "./templates/simple_log.json",
      "type": "log",
      "uri": "templates://simple_log"
    }
  ]
}
```

#### Template Content: `templates://<name>`
Get template content with metadata about placeholders and time fields.

**Example:** `templates://simple_trace`
```json
{
  "name": "simple_trace",
  "path": "./templates/simple_trace.json",
  "type": "trace",
  "content": { ... },
  "metadata": {
    "placeholders": ["{{trace.1}}", "{{span.1}}"],
    "timeFields": ["resourceSpans.0.scopeSpans.0.spans.0.startTimeUnixNano"]
  }
}
```

#### Endpoints Info: `endpoints://info`
All HTTP and WebSocket endpoints exposed by the server.

**Example:**
```json
{
  "http": {
    "endpoints": [
      { "path": "/v1/traces", "method": "POST", "purpose": "Receive OTLP traces (HTTP)" },
      { "path": "/api/otel", "method": "POST", "purpose": "Send OTEL JSON data (internal API)" }
    ],
    "baseUrl": "http://localhost:3000"
  },
  "websocket": {
    "channels": [
      { "path": "/otelcol_out", "purpose": "OTEL Collector OTLP output" },
      { "path": "/refinery_out", "purpose": "Refinery batch output" }
    ],
    "baseUrl": "ws://localhost:3000"
  },
  "otlp": {
    "http": "http://localhost:4318",
    "grpc": "grpc://localhost:4317"
  }
}
```

#### OTEL Collector Config: `config://otelcol`
Parsed OTEL Collector configuration with pipeline structure.

**Example:**
```json
{
  "path": "./runtime/otelcol-config.yml",
  "rawYaml": "...",
  "parsed": {
    "receivers": ["otlp", "filelog/simple"],
    "processors": ["batch", "filter/log"],
    "exporters": ["debug", "otlp/honeycomb"],
    "extensions": [],
    "pipelines": {
      "logs": {
        "receivers": ["otlp"],
        "processors": ["batch"],
        "exporters": ["debug"]
      }
    }
  },
  "fullConfig": { ... }
}
```

#### Refinery Config: `config://refinery`
Parsed Refinery configuration.

**Example:**
```json
{
  "path": "./runtime/refinery-config.yml",
  "rawYaml": "...",
  "parsed": { ... }
}
```

#### Processes List: `processes://list`
Enhanced process information with context.

**Example:**
```json
{
  "processes": [
    {
      "pid": "12345",
      "type": "otelcol",
      "command": "./runtime/otelcol-contrib --config=...",
      "user": "howardyoo",
      "startTime": "10:30",
      "configPath": "./runtime/otelcol-config.yml"
    }
  ]
}
```

#### Saved JSON List: `saved://list`
List all saved JSON files with metadata.

**Example:**
```json
{
  "saved": [
    {
      "name": "test_trace",
      "path": "./saved/test_trace.json",
      "type": "trace",
      "size": 2363,
      "modified": "2025-01-25T18:13:00Z",
      "uri": "saved://test_trace"
    }
  ]
}
```

#### Saved JSON Content: `saved://<name>`
Get saved JSON with validation results.

**Example:** `saved://test_trace`
```json
{
  "name": "test_trace",
  "path": "./saved/test_trace.json",
  "type": "trace",
  "content": { ... },
  "validation": {
    "valid": true,
    "errors": []
  }
}
```

#### Available Versions: `versions://available`
All available versions for OTEL Collector and Refinery (cached for 5 minutes).

**Example:**
```json
{
  "otelCollector": ["0.142.0", "0.141.0", ...],
  "refinery": ["3.0.1", "3.0.0", ...]
}
```

#### OTEL Collector Modules: `modules://otelcol`
Available OTEL Collector modules.

**Example:**
```json
{
  "version": "0.142.0",
  "receiver": ["otlp", "filelog", "hostmetrics", ...],
  "processor": ["batch", "filter", "transform", ...],
  "exporter": ["debug", "otlp", "otlphttp", ...]
}
```

#### OTEL JSON Schema: `schema://otel`
OTEL JSON schema for validation reference.

#### Latest OTEL Collector Outputs: `output://otelcol/latest`
Latest outputs (traces, metrics, logs) received from the OTEL Collector.

**Example:**
```json
{
  "count": 5,
  "outputs": [
    {
      "type": "traces",
      "data": { "resourceSpans": [...] },
      "timestamp": "2024-01-15T10:30:00Z"
    }
  ],
  "note": "Outputs are ordered from newest to oldest"
}
```

#### Latest Refinery Outputs: `output://refinery/latest`
Latest outputs (traces, metrics, logs) received from Refinery.

#### OTEL Collector Console Output: `console://otelcol/latest`
Latest console output (stdout/stderr) from the OTEL Collector process.

**Example:**
```
[2024-01-15T10:30:00Z] 2024-01-15T10:30:00.000-0500	info	service/service.go:161	Starting otelcol-contrib...
[2024-01-15T10:30:01Z] 2024-01-15T10:30:01.000-0500	info	service/service.go:200	Everything is ready.
```

#### Refinery Console Output: `console://refinery/latest`
Latest console output (stdout/stderr) from the Refinery process.

#### Skills (AI Agent Guidance)

Skills are read-only resources that teach AI agents how to use oteltester effectively. Read these to learn workflows, tool usage, and verification strategies.

| Resource | Purpose |
|----------|---------|
| `skills://list` | List all available skill resources |
| `skills://overview` | Executive overview of oteltester capabilities |
| `skills://installation` | Install and run different versions of OTEL Collector and Refinery |
| `skills://configuration` | Formulate YAML configs for OTEL Collector and Refinery |
| `skills://testing-workflow` | Submit OTLP JSON, monitor logs, re-submit to Refinery |
| `skills://collector-verification` | Verify OTEL Collector config correctness |
| `skills://refinery-verification` | Verify Refinery sampling rules |
| `skills://honeycomb-forwarding` | Send data to Honeycomb (requires API key from user) |

**Example:** `skills://overview` returns structured JSON describing what oteltester can do and which skills to read next. Each skill includes tool references, resource references, and step-by-step workflows.

**Recommended order for agents:** Start with `skills://overview`, then `skills://installation` if binaries need to be installed, then `skills://configuration` and `skills://testing-workflow` for the core testing flow.

### Resources vs Tools

**When to use Resources:**
- Read-only operations
- System state discovery
- Listing available options
- Understanding current configuration

**When to use Tools:**
- Modify state (install, start, stop)
- Send data
- Write files
- Create/delete saved JSON

**Efficiency Comparison:**

| Task | With Tools Only | With Resources | Improvement |
|------|----------------|----------------|-------------|
| Check system ready | 4-5 calls (get_config, get_pids, version checks) | 1 read (system://status) | 75% reduction |
| Find test template | Guess filenames, multiple get_json calls | 1 read (templates://list) | Enables discovery |
| Understand config | get_yaml + parse YAML yourself | 1 read (config://otelcol) | No client parsing |

## Available Tools

### Configuration Management
- `get_config` - Get current configuration
- `save_config` - Save configuration

### Installation
- `get_otelcol_versions` - List available Collector versions
- `get_refinery_versions` - List available Refinery versions
- `get_otelcol_version` - Get installed Collector version
- `get_refinery_version` - Get installed Refinery version
- `install_otelcol` - Install Collector (async)
- `install_refinery` - Install Refinery (async)

### Process Management
- `get_pids` - List running processes
- `start_otelcol` - Start Collector (async output)
- `start_refinery` - Start Refinery (async output)
- `stop_process` - Stop a process by PID
- `refresh_process` - Reload config for a process

### File Operations
- `get_yaml` - Read YAML file
- `save_yaml` - Save YAML file
- `get_json` - Read JSON file
- `save_json` - Save JSON file

### Saved JSON Management
- `list_saved_json` - List saved JSON files
- `get_saved_json` - Get saved JSON by name
- `save_saved_json` - Save JSON to saved directory
- `delete_saved_json` - Delete saved JSON

### Testing
- `send_otel_json` - Send OTEL JSON to endpoint (async)
- `get_otelcol_output` - Collect Collector output (async)
- `get_refinery_output` - Collect Refinery output (async)

### Output Retrieval and Forwarding
- `get_latest_otelcol_output` - Get latest outputs from OTEL Collector buffer (traces, metrics, logs)
- `get_latest_refinery_output` - Get latest outputs from Refinery buffer
- `forward_otelcol_output_to_refinery` - Forward Collector output directly to local Refinery
- `forward_output_to_target` - Forward output from otelcol or refinery to any target URL
- `clear_output_buffer` - Clear the output buffer (otelcol, refinery, or both)

### Console Output Monitoring
- `get_otelcol_console_output` - Get latest console output (stdout/stderr) from Collector (tail)
- `get_refinery_console_output` - Get latest console output (stdout/stderr) from Refinery (tail)
- `get_console_output_paginated` - Get console output with pagination support
- `search_console_output` - Search console output for patterns (errors, warnings, etc.)
- `clear_console_buffer` - Clear the console output buffer (otelcol, refinery, or both)

### Module Information
- `get_otelcol_modules` - Get available Collector modules

## Asynchronous Operations

Many operations (installations, process starts, output collection) are asynchronous. These operations return a `taskId` and `taskUri` that can be polled to check status and retrieve results.

### Example: Starting Collector

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "start_otelcol",
    "arguments": {}
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "taskId": "task_1_1234567890",
    "pid": 12345,
    "message": "otelcol started successfully",
    "taskUri": "/mcp/tasks/task_1_1234567890"
  }
}
```

**Polling Task Status:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tasks/get",
  "params": {
    "taskId": "task_1_1234567890"
  }
}
```

**Task Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "id": "task_1_1234567890",
    "type": "start_otelcol",
    "status": "running",
    "createdAt": "2024-01-15T10:30:00Z",
    "data": {
      "pid": 12345
    },
    "output": [
      {
        "type": "stdout",
        "data": "Collector started..."
      }
    ],
    "error": null
  }
}
```

## Task Status Values

- `running` - Task is in progress
- `completed` - Task finished successfully
- `failed` - Task encountered an error

## Output Collection

The `get_otelcol_output` and `get_refinery_output` tools create tasks that collect output for a specified duration. Output includes:
- Process stdout/stderr
- OTLP traces/metrics/logs received
- Batch data (for refinery)

Output is collected in real-time and can be polled via the task status endpoint.

## Error Handling

Errors are returned in the standard JSON-RPC error format:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32000,
    "message": "Error description",
    "data": "Additional error details"
  }
}
```

## Example Workflow

1. **Get available versions:**
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "get_otelcol_versions", "arguments": {}}}
```

2. **Install Collector:**
```json
{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "install_otelcol", "arguments": {"version": "0.118.0"}}}
```

3. **Poll installation status:**
```json
{"jsonrpc": "2.0", "id": 3, "method": "tasks/get", "params": {"taskId": "task_2_..."}}
```

4. **Get configuration:**
```json
{"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "get_config", "arguments": {}}}
```

5. **Save configuration:**
```json
{"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"name": "save_yaml", "arguments": {"path": "...", "content": "..."}}}
```

6. **Start Collector:**
```json
{"jsonrpc": "2.0", "id": 6, "method": "tools/call", "params": {"name": "start_otelcol", "arguments": {}}}
```

7. **Send test data:**
```json
{"jsonrpc": "2.0", "id": 7, "method": "tools/call", "params": {"name": "send_otel_json", "arguments": {"url": "http://localhost:8080", "json": {...}}}}
```

## Output Retrieval and Forwarding

AI agents can retrieve outputs from OTEL Collector and Refinery buffers, and forward them to targets for further testing.

### Get Latest Outputs

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_latest_otelcol_output",
    "arguments": {
      "count": 10
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "outputs": [
      {
        "type": "traces",
        "data": { "resourceSpans": [...] },
        "timestamp": "2024-01-15T10:30:00Z"
      }
    ],
    "count": 1
  }
}
```

### Forward Output to Refinery

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "forward_otelcol_output_to_refinery",
    "arguments": {
      "outputIndex": 0
    }
  }
}
```

### Forward Output to Any Target

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "forward_output_to_target",
    "arguments": {
      "source": "otelcol",
      "targetUrl": "https://api.honeycomb.io",
      "outputIndex": 0,
      "headers": {
        "x-honeycomb-team": "your-api-key"
      }
    }
  }
}
```

## Console Output Monitoring

AI agents can monitor and check the console output (stdout/stderr) from otelcol and refinery processes to understand what's happening and detect errors.

### Get Console Output (Tail)

Get the latest N lines from the console output buffer:

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_otelcol_console_output",
    "arguments": {
      "lines": 50
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "source": "otelcol",
    "lines": [
      {
        "line": "2024-01-15T10:30:00.000-0500\tinfo\tservice/service.go:161\tStarting otelcol-contrib...",
        "timestamp": "2024-01-15T15:30:00Z"
      }
    ],
    "total": 150,
    "returned": 50,
    "output": "[2024-01-15T15:30:00Z] 2024-01-15T10:30:00.000-0500\tinfo\tservice/service.go:161\tStarting otelcol-contrib..."
  }
}
```

### Get Console Output with Pagination

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "get_console_output_paginated",
    "arguments": {
      "source": "otelcol",
      "page": 1,
      "pageSize": 50
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "source": "otelcol",
    "page": 1,
    "pageSize": 50,
    "totalLines": 500,
    "totalPages": 10,
    "hasMore": true,
    "lines": [...],
    "output": "..."
  }
}
```

### Search Console Output for Errors

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "search_console_output",
    "arguments": {
      "source": "otelcol",
      "pattern": "error|failed|warn",
      "caseSensitive": false
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "source": "otelcol",
    "pattern": "error|failed|warn",
    "matchCount": 15,
    "totalLines": 500,
    "matches": [
      {
        "index": 42,
        "line": "2024-01-15T10:30:00.000-0500\twarn\tottl@v0.142.0/parser.go:410\tfailed to execute statement...",
        "timestamp": "2024-01-15T15:30:00Z"
      }
    ],
    "matchedLines": "[2024-01-15T15:30:00Z] Line 42: 2024-01-15T10:30:00.000-0500\twarn\t..."
  }
}
```

### Clear Console Buffer

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "clear_console_buffer",
    "arguments": {
      "source": "both"
    }
  }
}
```

## Real-Time UI Sync

When AI agents perform actions via MCP (configuration changes, data submission, output forwarding), these actions are automatically broadcast to connected browser UIs via WebSocket. The UI displays notifications for:

- **Config Saved** - When configuration files are saved
- **OTEL Data Submission** - When data is submitted via MCP
- **Process Started/Stopped** - When processes are started or stopped
- **Output Forwarding** - When outputs are forwarded to targets
- **Buffer Cleared** - When output/console buffers are cleared

This allows users to monitor AI agent activity in real-time through the browser interface.

## Notes

- Authentication is not currently implemented (local use only)
- Tasks are automatically cleaned up after 1 hour
- WebSocket connections are used internally for real-time output
- All file paths should be relative to the working directory or absolute paths
- Console output buffers store up to 500 lines per process
- Output buffers store up to 50 outputs per source (otelcol/refinery)