import { NextRequest, NextResponse } from "next/server";
import { currentEnvironment, forwardSession, linkSandbox, sessionToken } from "@/lib/server/session";

/** Organisations are created on live (and opened in the sandbox when that is where the person is). */
export async function POST(req: NextRequest) {
  const token = await sessionToken("live");
  if (!token) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  const res = await forwardSession("/auth/organisations", await req.json(), token);
  if (!res.ok || (await currentEnvironment()) !== "sandbox") return res;
  const live = await res.json();
  const sandbox = await linkSandbox();
  // Keep the new organisation's API key (shown once) from the live response.
  return sandbox.ok ? NextResponse.json({ ...(await sandbox.json()), ...(live.apiKey && { apiKey: live.apiKey }) }) : sandbox;
}
