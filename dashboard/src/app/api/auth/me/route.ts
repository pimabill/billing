import { NextResponse } from "next/server";

import { backendFor, browserSession, currentEnvironment, linkSandbox, refreshAccessToken, sessionToken } from "@/lib/server/session";

async function fetchMe(base: string, token: string) {
  return fetch(`${base}/api/auth/session`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function GET() {
  const env = await currentEnvironment();
  const base = backendFor(env);
  const token = await sessionToken(env);

  try {
    let res = token ? await fetchMe(base, token) : null;
    // Expired or missing access token: try the refresh token.
    if (!res?.ok) {
      const fresh = await refreshAccessToken(env);
      // A lapsed sandbox session reopens from live, as long as live is still signed in.
      if (!fresh) return env === "sandbox" ? linkSandbox() : NextResponse.json({ message: "Session expired" }, { status: 401 });
      res = await fetchMe(base, fresh);
      if (!res.ok) return NextResponse.json({ message: "Session expired" }, { status: 401 });
    }
    return NextResponse.json(browserSession(await res.json()));
  } catch {
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
