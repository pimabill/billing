import { NextRequest } from "next/server";
import { forwardSession, setEnvironment } from "@/lib/server/session";

export async function POST(req: NextRequest) {
  const res = await forwardSession("/auth/register", await req.json());
  if (res.ok) await setEnvironment("live");
  return res;
}
