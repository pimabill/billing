import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";
/** Links from the sandbox open here too; their tokens are only valid there. */
const SANDBOX_BACKEND_URL = process.env.SANDBOX_BACKEND_URL || "";

/** Proxy for the hosted checkout. The link's token is the credential, and reaches one invoice only. */
async function forward(token: string, init?: RequestInit) {
  try {
    const call = (base: string) =>
      fetch(`${base}/api/pay/${encodeURIComponent(token)}`, { ...init, headers: { "Content-Type": "application/json" }, cache: "no-store" });
    let res = await call(BACKEND_URL);
    // A token live did not issue may be a sandbox link.
    if (res.status === 401 && SANDBOX_BACKEND_URL) res = await call(SANDBOX_BACKEND_URL);
    return new NextResponse(await res.arrayBuffer(), {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") || "application/json", "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ message: "We could not reach the payment service. Try again in a moment." }, { status: 502 });
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return forward((await params).token);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return forward((await params).token, { method: "POST", body: (await req.text()) || "{}" });
}
