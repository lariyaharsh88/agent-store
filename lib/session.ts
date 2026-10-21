import { cookies, headers } from "next/headers";

export const SESSION_COOKIE = "as_sid";

/** Session id for the current request: middleware sets the header; the cookie is the fallback. */
export async function getSessionId(): Promise<string> {
  const h = await headers();
  const fromHeader = h.get("x-session-id");
  if (fromHeader) return fromHeader;
  const c = await cookies();
  return c.get(SESSION_COOKIE)?.value ?? "anonymous";
}

export function sessionFromRequest(req: Request): string {
  const h = req.headers.get("x-session-id");
  if (h) return h;
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(/(?:^|;\s*)as_sid=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "anonymous";
}
