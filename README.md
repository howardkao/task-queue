# Task Queue

This repository has been sanitized for public use. It does not include live Firebase project bindings, local Claude/MCP config, private calendar feed URLs, or local `.env` files.

## Required configuration

### Frontend

Copy `frontend/.env.example` to a local `.env` file and fill in your Firebase web app config plus the calendar worker URL.

### MCP server

Set the Firebase config values from `mcp-server/.env.example` in the environment before starting the server.

### Cloudflare Worker

Update `worker/wrangler.toml` with your Firebase project ID and allowed frontend origin, then set your calendar feed secret with Wrangler.

### Firebase Functions

Set `ALLOWED_ORIGINS` to a comma-separated list of permitted frontend origins in the deployment environment.
