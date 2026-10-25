import { NextRequest } from "next/server";
import { forwardSession, setEnvironment } from "@/lib/server/session";

// The second step of signing in, on live like the first.
export async function POST(req: NextRequest) {
  const res = await forwardSession("/auth/mfa/verify", await req.json());
  if (res.ok) await setEnvironment("live");
  return res;
}
