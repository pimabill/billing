import { NextRequest } from "next/server";
import { forwardSession, setEnvironment } from "@/lib/server/session";

// Everyone signs in on live; the sandbox is reached by switching.
export async function POST(req: NextRequest) {
  const res = await forwardSession("/auth/login", await req.json());
  if (res.ok) await setEnvironment("live");
  return res;
}
