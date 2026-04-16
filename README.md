<div align="center">
<h1>P4 Plan MCP Server</h1>

![Support](https://img.shields.io/badge/Support-Community-yellow.svg)
![License](https://img.shields.io/badge/License-MIT-blue.svg)

<p>
  <strong>MCP (Model Context Protocol) server for P4 Plan, enabling AI assistants like Claude and VS Code Copilot to interact with P4 Plan project management data.</strong>
</p>

<nav aria-label="Quick navigation">
  <p align="center">
    <a href="#architecture">Architecture</a> ·
    <a href="#prerequisites">Prerequisites</a> ·
    <a href="#quick-start-npx">Quick Start</a> ·
    <a href="#installation">Install</a> ·
    <a href="#client-configuration">Client Configurations</a> ·
    <a href="#available-tools-28-total">Tools</a>
  </p>
  <p align="center">
    <a href="#skills--resources">Skills</a> ·
    <a href="#logging">Logging</a> ·
    <a href="#troubleshooting">Troubleshoot</a> ·
    <a href="#development">Development</a> ·
    <a href="#license">License</a>
  </p>
</nav>
</div>

## Architecture

This service acts as a **stateless** protocol adapter between MCP clients (AI assistants) and the P4 Plan GraphQL API, using **stdio transport** (stdin/stdout).

```
┌─────────────────┐     stdio (stdin/stdout)    ┌─────────────────┐     GraphQL      ┌─────────────────┐
│   AI Client     │  ────────────────────────▶  │  P4 Plan MCP    │  ──────────────▶ │ P4 Plan GraphQL │
│(Claude, Copilot)│   Spawns as child process   │    Server       │    Port 4000     │      API        │
│                 │   P4PLAN_API_AUTH_TOKEN     │   (stateless)   │  Bearer token    │                 │
└─────────────────┘          env var            └─────────────────┘  forwarded       └─────────────────┘
```

The client spawns the MCP server as a child process. Authentication is provided via the `P4PLAN_API_AUTH_TOKEN` environment variable, which the server validates at startup and forwards to the GraphQL API on every tool call.

## Prerequisites

| Requirement             | Version                  | Notes                                                                                  |
|-------------------------|--------------------------|----------------------------------------------------------------------------------------|
| **Node.js**             | \>= 20 (24+ recommended) | The server targets ES2023. Check with `node -v`.                                       |
| **npm**                 | \>= 9                    | Comes with Node.js. Check with `npm -v`.                                               |
| **P4 Plan API**         | \>= 2026.1.002           | Required for all tool operations. Earlier versions are not supported.                  |

> **Tip:** Use [nvm](https://github.com/nvm-sh/nvm) to manage Node.js versions, or skip the Node.js requirement entirely by using [Docker](#docker).

## Quick Start (npx)

The fastest way to get started — **no installation required**. Just configure your MCP client to use `npx`:

```bash
npx -y @perforce/p4plan-mcp
```

`npx` automatically downloads and runs the latest version of the server. Your MCP client (VS Code, Claude Desktop, etc.) handles this for you — just add the config below and start chatting.

**VS Code** — add to `.vscode/mcp.json`:

```json
{
    "servers": {
        "p4-plan": {
            "type": "stdio",
            "command": "npx",
            "args": ["-y", "@perforce/p4plan-mcp"],
            "env": {
                "P4PLAN_API_AUTH_TOKEN": "YOUR_JWT_TOKEN",
                "P4PLAN_API_URL": "http://localhost:4000"
            }
        }
    }
}
```

**Claude Desktop** — add to your config:

```json
{
  "mcpServers": {
    "p4-plan": {
      "command": "npx",
      "args": ["-y", "@perforce/p4plan-mcp"],
      "env": {
        "P4PLAN_API_AUTH_TOKEN": "YOUR_JWT_TOKEN",
        "P4PLAN_API_URL": "http://localhost:4000"
      }
    }
  }
}
```

> **Note:** The `-y` flag auto-confirms the npm install prompt so the server starts without user interaction.

See [Client Configuration](#client-configuration) for more options including Docker, secure token prompts, and local builds.

## Installation

<details><summary><b>Build from source</b></summary>

For development or when you want to run from a local clone:

```bash
npm ci
npm run build

# For using npx locally
npm link
```

</details>

<details><summary><b>Run from Docker</b></summary>

Run the MCP server via Docker instead of installing Node.js locally. The MCP client (VS Code, Claude Desktop) spawns the container as a child process — same as `npx`, just using `docker` as the command.

**Build the image:**

```bash
docker build -t p4-plan-mcp .
```

**VS Code** (`.vscode/mcp.json`):

```json
{
    "servers": {
        "p4-plan": {
            "type": "stdio",
            "command": "docker",
            "args": [
                "run", "-i", "--rm",
                "-e", "P4PLAN_API_AUTH_TOKEN=YOUR_JWT_TOKEN",
                "-e", "P4PLAN_API_URL=http://host.docker.internal:4000",
                "p4-plan-mcp"
            ]
        }
    }
}
```

**Claude Desktop:**

```json
{
  "mcpServers": {
    "p4-plan": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "P4PLAN_API_AUTH_TOKEN=YOUR_JWT_TOKEN",
        "-e", "P4PLAN_API_URL=http://host.docker.internal:4000",
        "p4-plan-mcp"
      ]
    }
  }
}
```

> **Note:** Use `host.docker.internal` (macOS/Windows) or `172.17.0.1` (Linux) to reach the P4 Plan GraphQL API running on the host machine.

</details>

## Configuration

Copy the example config and configure:

```bash
cp config-example.env .env
```

Edit `.env` with your settings:

```dotenv
# JWT token for authenticating with P4 Plan GraphQL API
P4PLAN_API_AUTH_TOKEN=your-jwt-token

# P4 Plan GraphQL API URL
P4PLAN_API_URL=http://localhost:4000

# Logging level
LOG_LEVEL=debug

# Search results limit (default: 400)
# SEARCH_LIMIT=400

# Allow self-signed TLS certificates (for HTTPS APIs with untrusted certs)
# P4PLAN_ALLOW_SELF_SIGNED_CERTS=true
```


The server communicates via stdin/stdout. It is not meant to be run interactively — MCP clients (VS Code, Claude Desktop) spawn it as a child process automatically.

## Authentication

The MCP server requires a JWT token provided via the `P4PLAN_API_AUTH_TOKEN` environment variable. The token is validated at startup and forwarded to the P4 Plan GraphQL API on every tool call. No sessions or state are maintained.

### Obtaining a JWT Token

Get a JWT token from the P4 Plan GraphQL API using `curl`. You can authenticate with either your **password** or a **Personal Access Token (PAT)**:

<details><summary><b>Using your password</b></summary>

```bash
curl -s -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation Login($loginUserInput: LoginUserInput!) { login(loginUserInput: $loginUserInput) { access_token } }",
    "variables": { "loginUserInput": { "username": "YOUR_USERNAME", "password": "YOUR_PASSWORD" } }
  }'
```

</details>

<details><summary><b>Using a Personal Access Token (recommended)</b></summary>

A PAT can be used in place of your password in the same login mutation. This avoids exposing your actual password:

```bash
curl -s -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation Login($loginUserInput: LoginUserInput!) { login(loginUserInput: $loginUserInput) { access_token } }",
    "variables": { "loginUserInput": { "username": "YOUR_USERNAME", "password": "YOUR_PERSONAL_ACCESS_TOKEN" } }
  }'
```

</details>

Both methods return the same response:

```json
{
  "data": {
    "login": {
      "access_token": "eyJhbGciOiJIUzI1NiIs..."
    }
  }
}
```

Copy the `access_token` value and use it in your MCP client configuration.

<details><summary><b>Getting a Personal Access Token</b></summary>

1. Log in to P4 Plan
2. Go to **User Settings** → **Personal Access Tokens**
3. Click **Generate New Token**
4. Set an appropriate expiration date
5. Copy the token — use it in the login mutation above to obtain a JWT

</details>

> **Note:** JWT tokens expire. When your token expires, the server will fail to start with an authentication error. Generate a new JWT using the same `curl` command above.

## Available Tools (28 total)

### Projects

<details>
  <summary><strong><code>list_projects</code></strong> - List all active projects the user is a member of</summary>

- **Use cases**: Discover project IDs needed by other tools

</details>

<details>
  <summary><strong><code>get_project</code></strong> - Get project configuration including archivedStatus, backlog ID, and QA ID</summary>

- **Parameters**: `projectId`
- **Use cases**: Retrieve section IDs (backlog, QA, planning) for other tools

</details>

### Tasks

<details>
  <summary><strong><code>get_my_tasks</code></strong> - Get tasks assigned to current user (todoList)</summary>

- **Parameters**: `showCompleted`, `showOnlyNextFourWeeks`, `showHidden`, `showPipelineTasksThatCannotStart`
- **Use cases**: View personal work queue across all projects

</details>

<details>
  <summary><strong><code>get_tasks</code></strong> - Get detailed information for one or more items by ID (max 20)</summary>

- **Parameters**: `taskIds` (array of strings, max 20)
- **Use cases**: Full item details, link inspection, batch retrieval of multiple items

</details>

<details>
  <summary><strong><code>search_tasks</code></strong> - Search for items in a project section using P4 Plan Find queries</summary>

- **Parameters**: `findQuery`, `projectId`
- Uses P4 Plan Find query syntax for all searches. Call `read_skill` with `skillName="search-queries"` first to get exact column names, operators, and value formats. For simple name search use `Itemname:Text("text")`. Supports filtering by status, assignee, severity, item type, dates, boolean conditions, and combinations with AND/OR/NOT.
- Each project has three sections (Backlog, QA, Planning) with different IDs.
- **Use cases**: Item discovery, filtering, reporting

</details>

<details>
  <summary><strong><code>create_item</code></strong> - Create any item type</summary>

- **Types**: `backlog_task`, `bug`, `scheduled_task`, `sprint`, `release`, `sprint_task`
- **Parameters**: `type`, `name`, `projectId`, `parentItemId`, `previousItemId`, and type-specific fields
- **Use cases**: Task creation, sprint creation, bug filing

</details>

<details>
  <summary><strong><code>update_item</code></strong> - Update any item (auto-detects type)</summary>

- **Types**: BacklogTask, Bug, ScheduledTask, Sprint, Release
- **Parameters**: `itemId`, plus any updatable fields (name, status, assignedTo, points, etc.)
- **Use cases**: Status updates, assignments, estimation, sprint configuration

</details>

### Sprint & Release Management

<details>
  <summary><strong><code>commit_to_sprint</code></strong> - Commit a backlog task or bug to a sprint</summary>

- **Parameters**: `taskId`, `sprintId`
- **Use cases**: Sprint planning, backlog commitment

</details>

<details>
  <summary><strong><code>uncommit_from_sprint</code></strong> - Remove a task from a sprint (return to backlog)</summary>

- **Parameters**: `taskId`
- **Use cases**: Sprint scope adjustment

</details>

### Custom Fields & Workflows

<details>
  <summary><strong><code>get_custom_columns</code></strong> - Get custom column definitions available in a project</summary>

- **Parameters**: `projectId`
- **Use cases**: Discover custom fields before reading/writing values

</details>

<details>
  <summary><strong><code>get_custom_fields</code></strong> - Get custom field values set on a task</summary>

- **Parameters**: `taskId`, `onlySet`
- **Use cases**: Read project-specific metadata

</details>

<details>
  <summary><strong><code>set_custom_field</code></strong> - Set a custom field value on a task</summary>

- **Parameters**: `taskId`, `columnId`, `value`
- **Use cases**: Update project-specific metadata

</details>

<details>
  <summary><strong><code>get_workflows</code></strong> - Get workflow definitions and status IDs for a project</summary>

- **Parameters**: `projectId`
- **Use cases**: Discover workflow statuses for status transitions

</details>

### Task Actions

<details>
  <summary><strong><code>complete_task</code></strong> - Mark a task as completed</summary>

- **Parameters**: `taskId`
- **Use cases**: Quick status update convenience method

</details>

<details>
  <summary><strong><code>start_task</code></strong> - Mark a task as in progress</summary>

- **Parameters**: `taskId`
- **Use cases**: Quick status update convenience method

</details>

### Comments & Attachments

<details>
  <summary><strong><code>get_comments</code></strong> - Get all comments on a task</summary>

- **Parameters**: `taskId`
- **Use cases**: Read discussion history

</details>

<details>
  <summary><strong><code>post_comment</code></strong> - Post a new comment on a task</summary>

- **Parameters**: `taskId`, `text`
- **Use cases**: Add discussion, acceptance criteria, notes

</details>

<details>
  <summary><strong><code>update_comment</code></strong> - Edit an existing comment</summary>

- **Parameters**: `taskId`, `commentId`, `text`
- **Use cases**: Correct or update existing comments

</details>

<details>
  <summary><strong><code>delete_comment</code></strong> - Delete a comment from a task</summary>

- **Parameters**: `taskId`, `commentId`
- **Use cases**: Remove outdated or incorrect comments

</details>

<details>
  <summary><strong><code>get_attachments</code></strong> - Get all attachments on a task</summary>

- **Parameters**: `taskId`
- **Use cases**: List attached files, discover paths for download

</details>

<details>
  <summary><strong><code>download_attachment</code></strong> - Download and return attachment file content</summary>

- **Parameters**: `taskId`, `path`
- Text files returned inline, images as base64
- **Use cases**: Read attached documents, view screenshots

</details>

<details>
  <summary><strong><code>delete_attachment</code></strong> - Delete an attachment from a task</summary>

- **Parameters**: `taskId`, `path`
- **Use cases**: Remove outdated attachments

</details>

<details>
  <summary><strong><code>set_cover_image</code></strong> - Set or unset the cover image for a task</summary>

- **Parameters**: `taskId`, `imagePath`
- **Use cases**: Set visual identity for cards/items

</details>

### Links

<details>
  <summary><strong><code>link_items</code></strong> - Create internal or external links</summary>

- **Parameters**: `fromItemId`, `toItemId` or `url`, `relation` (blocks, duplicates, relatedTo)
- **Use cases**: Dependency tracking, cross-references, external URLs

</details>

<details>
  <summary><strong><code>unlink_items</code></strong> - Remove an internal or external link</summary>

- **Parameters**: `fromItemId`, `toItemId` or `url`
- **Use cases**: Clean up outdated dependencies

</details>

### Users

<details>
  <summary><strong><code>get_current_user</code></strong> - Get current user information</summary>

- **Use cases**: Identity verification, user context

</details>

<details>
  <summary><strong><code>list_project_users</code></strong> - List users in a project</summary>

- **Parameters**: `projectId`
- **Use cases**: Find user IDs for assignments, sprint member management

</details>

### Skills

<details>
  <summary><strong><code>read_skill</code></strong> - Read a P4 Plan skill document at runtime</summary>

- **Parameters**: `skillName`
- Returns the full Markdown content of the requested skill document. The AI agent **must** call this with `skillName="search-queries"` before composing any `findQuery` for `search_tasks`.
- Available skills: `project-navigation`, `search-queries`, `task-management`, `planning`, `backlog-refinement`, `bug-tracking`, `custom-fields`, `gantt-scheduling`, `workflows`
- **Use cases**: Learn correct query syntax, discover tool usage patterns, understand domain concepts

</details>

## Client Configuration

<details>
  <summary><strong>VS Code (Copilot) — via npx (recommended)</strong></summary>

Create `.vscode/mcp.json` in your workspace:

```json
{
    "servers": {
        "p4-plan": {
            "type": "stdio",
            "command": "npx",
            "args": ["-y", "@perforce/p4plan-mcp"],
            "env": {
                "P4PLAN_API_AUTH_TOKEN": "YOUR_JWT_TOKEN",
                "P4PLAN_API_URL": "http://localhost:4000"
            }
        }
    }
}
```

> **Note:** The `-y` flag auto-confirms the npm install prompt so the server starts without user interaction.

</details>

<details>
  <summary><strong>VS Code (Copilot) — via node (local build)</strong></summary>

If running from a local clone instead of npm:

```json
{
    "servers": {
        "p4-plan": {
            "type": "stdio",
            "command": "node",
            "args": ["/path/to/MCP/dist/main.js"],
            "env": {
                "P4PLAN_API_AUTH_TOKEN": "YOUR_JWT_TOKEN",
                "P4PLAN_API_URL": "http://localhost:4000"
            }
        }
    }
}
```

</details>

<details>
  <summary><strong>VS Code — with secure token prompt</strong></summary>

For added security, you can use VS Code input prompts to avoid storing tokens in files:

```json
{
    "inputs": [
        {
            "type": "promptString",
            "id": "p4-plan-jwt",
            "description": "P4 Plan JWT Token",
            "password": true
        }
    ],
    "servers": {
        "p4-plan": {
            "type": "stdio",
            "command": "npx",
            "args": ["-y", "@perforce/p4plan-mcp"],
            "env": {
                "P4PLAN_API_AUTH_TOKEN": "${input:p4-plan-jwt}",
                "P4PLAN_API_URL": "http://localhost:4000"
            }
        }
    }
}
```

</details>

<details>
  <summary><strong>Claude Desktop</strong></summary>

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "p4-plan": {
      "command": "npx",
      "args": ["-y", "@perforce/p4plan-mcp"],
      "env": {
        "P4PLAN_API_AUTH_TOKEN": "YOUR_JWT_TOKEN",
        "P4PLAN_API_URL": "http://localhost:4000"
      }
    }
  }
}
```

Replace `YOUR_JWT_TOKEN` with a token obtained from the login mutation (see [Obtaining a JWT Token](#obtaining-a-jwt-token)).

</details>

<details>
  <summary><strong>Claude Code (CLI / VS Code extension)</strong></summary>

Create `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "p4-plan": {
      "command": "npx",
      "args": ["-y", "@perforce/p4plan-mcp"],
      "env": {
        "P4PLAN_API_AUTH_TOKEN": "YOUR_JWT_TOKEN",
        "P4PLAN_API_URL": "http://localhost:4000"
      }
    }
  }
}
```

For a local build, replace `"command"` and `"args"` with:

```json
{
  "mcpServers": {
    "p4-plan": {
      "command": "node",
      "args": ["/path/to/MCP/dist/main.js"],
      "env": {
        "P4PLAN_API_AUTH_TOKEN": "YOUR_JWT_TOKEN",
        "P4PLAN_API_URL": "http://localhost:4000"
      }
    }
  }
}
```

Or add it via the CLI:

```bash
claude mcp add p4-plan \
  -e P4PLAN_API_AUTH_TOKEN=YOUR_JWT_TOKEN \
  -e P4PLAN_API_URL=http://localhost:4000 \
  -- npx -y @perforce/p4plan-mcp
```

> **Note:** The server name must come **before** the `-e` flags, otherwise the variadic `-e` parser consumes the name as an env value.

**Verify it's running:** type `/mcp` inside Claude Code to check server status.

> **Tip:** Place `.mcp.json` in your project root to share the config with your team (tokens excluded). For personal config, add the server to `~/.claude.json` instead.

</details>

### Verifying the Connection

1. Ensure the P4 Plan GraphQL API is running
2. Open VS Code with the workspace containing `.vscode/mcp.json`
3. Look for "MCP SERVERS" in the Extensions sidebar — you should see "p4-plan" listed
4. Start a new Copilot chat and ask "What tasks are assigned to me?"

### Environment Variables

- `P4PLAN_API_AUTH_TOKEN` - JWT token for authenticating with the P4 Plan GraphQL API
- `P4PLAN_API_URL` - P4 Plan GraphQL API URL (default: `http://localhost:4000`)
- `P4PLAN_ALLOW_SELF_SIGNED_CERTS` - Set to `true` to accept self-signed or untrusted TLS certificates when connecting to the API over HTTPS (default: `false`)
- `LOG_LEVEL` - Logging level: `debug`, `info`, `warn`, `error` (default: `debug`)
- `SEARCH_LIMIT` - Maximum number of results returned by `search_tasks` (default: `400`)

## Skills & Resources

The server includes **skill files** — domain-specific guides that help AI agents construct correct tool calls. Skills are accessible in two ways:

- **`read_skill` tool** — any MCP client can call `read_skill` with a `skillName` to fetch skill content at runtime. This is the primary access method and works with all clients.
- **MCP resources** — skills are also registered as MCP resources (e.g., `skill://p4-plan/search-queries`) for clients that support native resource reading.

| Skill              | Purpose                                                     |
|--------------------|-------------------------------------------------------------|
| project-navigation | Finding projects, items, and getting started                |
| search-queries     | P4 Plan Find query syntax (column names, values, operators) |
| task-management    | Task CRUD, status, assignments, comments, attachments       |
| planning           | Sprints, releases, commitment, allocations                  |
| backlog-refinement | Backlog items, estimation, prioritization                   |
| bug-tracking       | Bugs, severity, QA section                                  |
| custom-fields      | Custom columns, project-specific metadata                   |
| gantt-scheduling   | Scheduled tasks, timeline, dependencies                     |
| workflows          | Workflows, pipelines, status state machines                 |

See [`skills/README.md`](skills/README.md) for details on using skills with different AI clients.

## Development

<details><summary><b>Local Testing with npm link</b></summary>

To test the `npx` experience locally without publishing to npm:

```bash
# Build and create a global symlink
npm run build
npm link

# Now test exactly as an end user would
P4PLAN_API_AUTH_TOKEN=your-jwt-token npx @perforce/p4plan-mcp

# Clean up when done
npm unlink -g @perforce/p4plan-mcp
```

The symlink persists across rebuilds — just run `npm run build` after code changes.

</details>

<details><summary><b>Adding New Tools</b></summary>

1. Create or edit a tools file in `src/tools/`
2. Define the tool with:
   - `name`: Unique tool identifier
   - `description`: What the tool does (shown to AI)
   - `inputSchema`: JSON Schema for parameters
   - `handler`: Function that executes the tool

3. Register in `ToolsModule`

</details>

<details><summary><b>Testing</b></summary>

```bash
# Unit tests
npm run test

# E2E tests (MCP protocol compliance via @modelcontextprotocol/sdk)
npm run test:e2e
```

</details>

### Logging

The server uses Winston with two transports:

- **Console (stderr):** Only warnings and errors are written to stderr. In VS Code, these appear in the Output panel under the "p4-plan" dropdown. Only `warn` and `error` level messages are shown to keep the output clean.
- **File:** Full debug logs are written to `logs/P4PlanMCP_<timestamp>.log`. Use these for detailed troubleshooting.

> **Note:** All console output goes to stderr (never stdout) because stdout is the MCP protocol channel. VS Code labels all stderr output as `[warning]` — this is expected behavior and does not indicate a problem.

## Protocol

This server uses the **MCP stdio transport** — communication happens over stdin/stdout using JSON-RPC 2.0 messages. The client spawns the server as a child process.

- **Transport:** stdio (stdin/stdout)
- **Protocol:** JSON-RPC 2.0
- **Authentication:** `P4PLAN_API_AUTH_TOKEN` environment variable (validated at startup)
- **SDK:** `@modelcontextprotocol/sdk` with `StdioServerTransport`

## Troubleshooting

<details>
  <summary><strong>Server fails to start</strong></summary>

1. **Check P4PLAN_API_AUTH_TOKEN is set:**
   The server requires a valid JWT token in the `P4PLAN_API_AUTH_TOKEN` environment variable. If missing, it exits immediately with an error.

2. **Check token is valid:**
   If the token is expired or invalid, the server exits with "Authentication failed". Generate a new JWT using the login mutation.

3. **Check GraphQL API is reachable:**
   The P4 Plan GraphQL API must be accessible at the configured `P4PLAN_API_URL` (default: `http://localhost:4000`).

</details>

<details>
  <summary><strong>Server not detected in VS Code</strong></summary>

1. **Verify mcp.json syntax:**
   Ensure your `.vscode/mcp.json` is valid JSON. Check for trailing commas.

2. **Check the command is available:**
   If using `npx`, ensure Node.js is in VS Code's PATH. If `npx` is not found, use the absolute path to `node` instead (see [local build config](#vs-code-copilot--via-node-local-build)).

3. **Reload VS Code window:**
   Press `Cmd+Shift+P` → "Developer: Reload Window"

4. **Start a new chat:**
   MCP servers are connected when a new chat session starts.

</details>

<details>
  <summary><strong>Tools don't work</strong></summary>

1. **Check GraphQL server is running:**
   The P4 Plan GraphQL API must be accessible at the configured URL.

2. **Check server logs:**
   In VS Code, check the Output panel → select "p4-plan" from the dropdown to see warnings/errors. For full debug logs, check the `logs/` directory.

3. **Verify the JWT hasn't expired:**
   Generate a new JWT if needed and update your mcp.json config.

</details>

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE.txt) for details.
