import { NextRequest } from "next/server";
import { forwardPublic } from "@/lib/server/session";

export async function POST(req: NextRequest) {
  return forwardPublic("/auth/forgot-password", { method: "POST", body: await req.json().catch(() => ({})) });
}
