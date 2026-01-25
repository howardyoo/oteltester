# MCP (Model Context Protocol) Interface

The oteltester service now exposes an MCP interface at `/mcp` that allows AI agents to interact with and control the oteltester functionality.

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

## Notes

- Authentication is not currently implemented (local use only)
- Tasks are automatically cleaned up after 1 hour
- WebSocket connections are used internally for real-time output
- All file paths should be relative to the working directory or absolute paths
