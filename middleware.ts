import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "as_sid";

/** Give every visitor (human or agent) a stable session id: cookie for browsers, header for API clients. */
export function middleware(req: NextRequest) {
  const fromHeader = req.headers.get("x-session-id");
  const fromCookie = req.cookies.get(COOKIE)?.value;
  const sid = fromHeader || fromCookie || crypto.randomUUID();
  const headers = new Headers(req.headers);
  headers.set("x-session-id", sid);
  const res = NextResponse.next({ request: { headers } });
  if (!fromCookie && !fromHeader) {
    res.cookies.set(COOKIE, sid, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  res.headers.set("x-session-id", sid);
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
