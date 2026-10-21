import { TOOLS } from "@/lib/tools";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const product = { type: "object", properties: { id: { type: "string" }, slug: { type: "string" }, name: { type: "string" }, category: { type: "string" }, price: { type: "number" }, list_price: { type: "number" }, url: { type: "string" } } };
  const toolPaths: Record<string, unknown> = {};
  for (const t of TOOLS) {
    toolPaths[`/api/agent/tools/${t.name}`] = {
      post: { summary: t.description, tags: ["operator"], security: [{ agentKey: [] }], requestBody: { content: { "application/json": { schema: t.input_schema } } }, responses: { "200": { description: "ok" }, "400": { description: "error" } } },
    };
  }
  return json({
    openapi: "3.1.0",
    info: { title: "Agent Store API", version: "0.1.0", description: "Shopping and operator APIs. Send x-session-id on shopping calls." },
    servers: [{ url: origin }],
    components: { securitySchemes: { agentKey: { type: "apiKey", in: "header", name: "x-agent-key" } }, parameters: { session: { name: "x-session-id", in: "header", schema: { type: "string" }, description: "Stable session id" } }, schemas: { Product: product } },
    paths: {
      "/api/home": { get: { summary: "Home page as data", tags: ["shopping"], parameters: [{ $ref: "#/components/parameters/session" }], responses: { "200": { description: "ok" } } } },
      "/api/catalog": { get: { summary: "Search products", tags: ["shopping"], parameters: [{ $ref: "#/components/parameters/session" }, { name: "q", in: "query", schema: { type: "string" } }, { name: "category", in: "query", schema: { type: "string" } }], responses: { "200": { description: "ok" } } } },
      "/api/products/{slug}": { get: { summary: "Product detail", tags: ["shopping"], parameters: [{ $ref: "#/components/parameters/session" }, { name: "slug", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "ok" }, "404": { description: "not found" } } } },
      "/api/cart": {
        get: { summary: "Get cart", tags: ["shopping"], parameters: [{ $ref: "#/components/parameters/session" }], responses: { "200": { description: "ok" } } },
        post: { summary: "Add to cart", tags: ["shopping"], parameters: [{ $ref: "#/components/parameters/session" }], requestBody: { content: { "application/json": { schema: { type: "object", properties: { product_id: { type: "string" }, qty: { type: "integer" } }, required: ["product_id"] } } } }, responses: { "200": { description: "ok" } } },
        delete: { summary: "Remove from cart", tags: ["shopping"], parameters: [{ $ref: "#/components/parameters/session" }], requestBody: { content: { "application/json": { schema: { type: "object", properties: { product_id: { type: "string" } }, required: ["product_id"] } } } }, responses: { "200": { description: "ok" } } },
      },
      "/api/checkout": { post: { summary: "Place order (demo, no payment)", tags: ["shopping"], parameters: [{ $ref: "#/components/parameters/session" }], requestBody: { content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" }, email: { type: "string" } } } } } }, responses: { "201": { description: "created" } } } },
      "/api/orders/{id}": { get: { summary: "Order detail", tags: ["shopping"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "ok" } } } },
      "/api/agent/tools": { get: { summary: "List operator tools", tags: ["operator"], responses: { "200": { description: "ok" } } } },
      "/api/agent/run": { post: { summary: "Run the optimizer once", tags: ["operator"], security: [{ agentKey: [] }], requestBody: { content: { "application/json": { schema: { type: "object", properties: { mode: { type: "string", enum: ["auto", "claude", "policy"] } } } } } }, responses: { "200": { description: "ok" } } } },
      "/api/metrics": { get: { summary: "Dashboard data", tags: ["operator"], responses: { "200": { description: "ok" } } } },
      ...toolPaths,
    },
  });
}
