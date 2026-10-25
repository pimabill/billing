import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/** Server-only helpers for the auth route handlers: the API base, session cookies and the user shape we hand the browser. */
export const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";
/** Set when this dashboard can also switch to a sandbox deployment's API. */
export const SANDBOX_BACKEND_URL = process.env.SANDBOX_BACKEND_URL || "";

export type Environment = "live" | "sandbox";

const ENV_COOKIE = "nb_env";
const COOKIES: Record<Environment, { access: string; refresh: string }> = {
  live: { access: "nb_token", refresh: "nb_refresh_token" },
  sandbox: { access: "nb_sbx_token", refresh: "nb_sbx_refresh_token" },
};
const cookieBase = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };

export function backendFor(env: Environment): string {
  return env === "sandbox" && SANDBOX_BACKEND_URL ? SANDBOX_BACKEND_URL : BACKEND_URL;
}

/** Which API this browser is looking at: live unless it switched to the sandbox (and one is configured). */
export async function currentEnvironment(): Promise<Environment> {
  if (!SANDBOX_BACKEND_URL) return "live";
  return (await cookies()).get(ENV_COOKIE)?.value === "sandbox" ? "sandbox" : "live";
}

export async function setEnvironment(env: Environment) {
  (await cookies()).set(ENV_COOKIE, env, { ...cookieBase, httpOnly: false, maxAge: 60 * 60 * 24 * 30 });
}

export interface BackendSession {
  accessToken?: string;
  refreshToken?: string;
  apiKey?: string;
  tenant: { id: string; name: string; email: string };
  user: { id: string; name: string; email: string };
  role: string;
  permissions: string[];
  organisations?: { id: string; name: string; slug: string; role: string }[];
}

export async function setSessionCookies(accessToken: string, refreshToken: string, env: Environment = "live") {
  const cookieStore = await cookies();
  cookieStore.set(COOKIES[env].access, accessToken, { ...cookieBase, maxAge: 60 * 60 }); // matches JWT expiration
  cookieStore.set(COOKIES[env].refresh, refreshToken, { ...cookieBase, maxAge: 60 * 60 * 24 * 7 });
}

/** Sign out of both environments. */
export async function clearSessionCookies() {
  const cookieStore = await cookies();
  for (const names of Object.values(COOKIES)) {
    cookieStore.set(names.access, "", { ...cookieBase, maxAge: 0 });
    cookieStore.set(names.refresh, "", { ...cookieBase, maxAge: 0 });
  }
  cookieStore.set(ENV_COOKIE, "", { ...cookieBase, httpOnly: false, maxAge: 0 });
}

/** What the browser keeps: display details and permissions, never tokens. */
export function browserSession(data: BackendSession) {
  return {
    user: {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      tenantId: data.tenant.id,
      tenantName: data.tenant.name,
      role: data.role.toLowerCase(),
      permissions: data.permissions,
    },
    ...(data.organisations && {
      organisations: data.organisations.map((o) => ({ ...o, role: o.role.toLowerCase() })),
    }),
    ...(data.apiKey && { apiKey: data.apiKey }),
  };
}

/** POST to an environment's API; returns its status and parsed body. */
async function post(env: Environment, path: string, body: unknown, token?: string) {
  const res = await fetch(`${backendFor(env)}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

/** Forward a request that returns a fresh session (tokens included) and keep the tokens in cookies. */
export async function forwardSession(path: string, body: unknown, token?: string, env: Environment = "live") {
  try {
    const { ok, status, data } = await post(env, path, body, token);
    if (!ok) return NextResponse.json({ message: data.message || "Request failed" }, { status });
    await setSessionCookies(data.accessToken, data.refreshToken, env);
    return NextResponse.json(browserSession(data));
  } catch {
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

export async function sessionToken(env?: Environment) {
  return (await cookies()).get(COOKIES[env ?? (await currentEnvironment())].access)?.value;
}

/** A fresh access token from the refresh cookie, or null when the session is over. */
export async function refreshAccessToken(env: Environment): Promise<string | null> {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(COOKIES[env].refresh)?.value;
  if (!refreshToken) return null;
  try {
    const { ok, data } = await post(env, "/auth/refresh", { refreshToken });
    if (!ok) return null;
    await setSessionCookies(data.accessToken, data.refreshToken, env);
    return data.accessToken;
  } catch {
    return null;
  }
}

/** A usable live access token: the cookie, or a refreshed one. */
async function liveToken(): Promise<string | null> {
  return (await sessionToken("live")) ?? (await refreshAccessToken("live"));
}

/**
 * Open the signed-in person's account on the sandbox, in the organisation they
 * are using on live: live signs a two-minute link, the sandbox accepts it.
 */
export async function linkSandbox() {
  if (!SANDBOX_BACKEND_URL) return NextResponse.json({ message: "No sandbox is configured for this dashboard" }, { status: 404 });
  try {
    let token = await liveToken();
    if (!token) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
    let link = await post("live", "/auth/sandbox/link", {}, token);
    if (link.status === 401 && (token = await refreshAccessToken("live"))) link = await post("live", "/auth/sandbox/link", {}, token);
    if (!link.ok) return NextResponse.json({ message: link.data.message || "Could not open the sandbox" }, { status: link.status });
    const accepted = await post("sandbox", "/auth/sandbox/accept", { token: link.data.token });
    if (!accepted.ok) return NextResponse.json({ message: accepted.data.message || "The sandbox refused the switch" }, { status: accepted.status });
    await setSessionCookies(accepted.data.accessToken, accepted.data.refreshToken, "sandbox");
    await setEnvironment("sandbox");
    return NextResponse.json(browserSession(accepted.data));
  } catch {
    return NextResponse.json({ message: "The sandbox is unavailable" }, { status: 502 });
  }
}
