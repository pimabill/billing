import { NextRequest, NextResponse } from "next/server";
import { currentEnvironment, forwardSession, linkSandbox, sessionToken } from "@/lib/server/session";

/** Switch organisation on live; in the sandbox, follow by opening the same organisation there. */
export async function POST(req: NextRequest) {
  const token = await sessionToken("live");
  if (!token) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  const res = await forwardSession("/auth/switch", await req.json(), token);
  if (!res.ok || (await currentEnvironment()) !== "sandbox") return res;
  return linkSandbox();
}
