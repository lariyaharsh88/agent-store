/** Operator endpoints are open locally; set AGENT_API_KEY to require a key. */
export function agentAuthorized(req: Request): boolean {
  const key = process.env.AGENT_API_KEY;
  if (!key) return true;
  const header = req.headers.get("x-agent-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === key;
}

export function agentName(req: Request): string {
  return (req.headers.get("x-agent-name") ?? "api-agent").slice(0, 64);
}
