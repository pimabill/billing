import { NextRequest, NextResponse } from "next/server";
import { SANDBOX_BACKEND_URL, currentEnvironment, linkSandbox, setEnvironment } from "@/lib/server/session";

// Read at request time from the container, so one dashboard image serves every setup.
export const dynamic = "force-dynamic";

/**
 * sandbox: the browser is looking at sandbox data (this deployment is a sandbox,
 * or it switched to one). canSwitch: this dashboard can switch between the two.
 */
export async function GET() {
  const deploymentIsSandbox = process.env.SANDBOX_MODE === "true";
  return NextResponse.json({
    sandbox: deploymentIsSandbox || (await currentEnvironment()) === "sandbox",
    canSwitch: Boolean(SANDBOX_BACKEND_URL) && !deploymentIsSandbox,
  });
}

/** Switch this browser between live and sandbox. */
export async function POST(req: NextRequest) {
  const { sandbox } = (await req.json().catch(() => ({}))) as { sandbox?: boolean };
  if (!sandbox) {
    await setEnvironment("live");
    return NextResponse.json({ sandbox: false });
  }
  return linkSandbox();
}
