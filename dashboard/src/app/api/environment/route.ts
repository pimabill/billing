import { NextResponse } from "next/server";

// Read at request time from the container, so one dashboard image serves live and sandbox.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ sandbox: process.env.SANDBOX_MODE === "true" });
}
