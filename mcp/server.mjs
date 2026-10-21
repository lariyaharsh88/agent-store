#!/usr/bin/env node
// MCP server (stdio) that exposes the store's operator tools to any MCP client
// (Claude Desktop, Claude Code, Cursor...). It proxies to a running store.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const base = process.env.STORE_URL || "http://localhost:3126";
const headers = { "content-type": "application/json", "x-agent-name": process.env.AGENT_NAME || "mcp-client", ...(process.env.AGENT_API_KEY ? { "x-agent-key": process.env.AGENT_API_KEY } : {}) };

const manifest = await (await fetch(`${base}/api/agent/tools`, { headers })).json();
const tools = [
  ...manifest.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema, annotations: { readOnlyHint: t.read_only } })),
  { name: "run_optimizer", description: "Run one cycle of the store's built-in optimizer agent.", inputSchema: { type: "object", properties: { mode: { type: "string", enum: ["auto", "claude", "policy"] } } } },
];

const server = new Server({ name: "agent-store", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const url = name === "run_optimizer" ? `${base}/api/agent/run` : `${base}/api/agent/tools/${name}`;
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(args ?? {}) });
  const data = await res.json();
  const payload = name === "run_optimizer" ? data : data.ok ? data.result : { error: data.error };
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], isError: !res.ok };
});

await server.connect(new StdioServerTransport());
