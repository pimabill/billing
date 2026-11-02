import { forwardPublic } from "@/lib/server/session";

export async function GET() {
  return forwardPublic("/auth/captcha");
}
