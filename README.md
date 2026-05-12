# P4 Plan MCP Server

Docker image for the P4 Plan MCP server.

This server lets MCP clients such as VS Code Copilot and Claude connect to P4 Plan project management data over the MCP stdio protocol.

## What this image does

- Runs the P4 Plan MCP server in a container
- Uses stdio transport so MCP clients can spawn it as a child process
- Authenticates with P4 Plan using a JWT in `P4PLAN_API_AUTH_TOKEN`
- Connects to the P4 Plan GraphQL API through `P4PLAN_API_URL`

The container is intended to be launched by an MCP client, not run interactively.

## Image

`perforce/p4plan-mcp:latest`

Pin a version tag instead of `latest` if you need reproducible deployments.

## Required environment variables

- `P4PLAN_API_AUTH_TOKEN`: JWT token for the P4 Plan GraphQL API
- `P4PLAN_API_URL`: GraphQL API URL, for example `http://host.docker.internal:4000`

Optional:

- `P4PLAN_ALLOW_SELF_SIGNED_CERTS=true`
- `LOG_LEVEL=debug|info|warn|error`
- `SEARCH_LIMIT=400`

## Self-signed certificates

Set `P4PLAN_ALLOW_SELF_SIGNED_CERTS=true` only when your `P4PLAN_API_URL` uses HTTPS with a self-signed or otherwise untrusted TLS certificate.

When using Docker, add `"-e", "P4PLAN_ALLOW_SELF_SIGNED_CERTS=true"` to the `args` list before `perforce/p4plan-mcp:latest`.

## VS Code example

Add this to `.vscode/mcp.json`:

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
        "perforce/p4plan-mcp:latest"
      ]
    }
  }
}
```

## Claude Code example

Create `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "p4-plan": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "P4PLAN_API_AUTH_TOKEN=YOUR_JWT_TOKEN",
        "-e", "P4PLAN_API_URL=http://host.docker.internal:4000",
        "perforce/p4plan-mcp:latest"
      ]
    }
  }
}
```

Use `host.docker.internal` on Windows and macOS. On Linux, use the host address that exposes your P4 Plan API, commonly `172.17.0.1`.

## Included capabilities

The server exposes tools for:

- Projects and task lookup
- Task creation and updates
- Sprint and release management
- Comments, attachments, and links
- Custom fields and workflows
- User lookup and runtime skill loading

## More information

- For more information: https://github.com/perforce/p4plan-mcp/blob/main/README.md

