import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";
/** Portal links from the sandbox open here too; their tokens are only valid there. */
const SANDBOX_BACKEND_URL = process.env.SANDBOX_BACKEND_URL || "";

/**
 * Proxy for the hosted customer portal. It forwards a portal token (issued by
 * POST /api/portal/customers/:externalId/sessions, scoped to one customer and
 * short-lived) in the Authorization header. API keys are refused: a link that
 * carries one would hand the customer full access to the merchant's account.
 */
function portalToken(req: NextRequest): string | NextResponse {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    return NextResponse.json({ message: "This portal link is missing its access token. Ask for a new link." }, { status: 401 });
  }
  if (token.startsWith("sk_")) {
    return NextResponse.json(
      { message: "API keys cannot be used in portal links. Create a portal link with POST /api/portal/customers/{externalId}/sessions." },
      { status: 401 },
    );
  }
  return token;
}

async function forward(path: string, token: string, init?: RequestInit) {
  try {
    const call = (base: string) =>
      fetch(`${base}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
    let res = await call(BACKEND_URL);
    // A token live did not issue may be a sandbox portal link.
    if (res.status === 401 && SANDBOX_BACKEND_URL) res = await call(SANDBOX_BACKEND_URL);
    const contentType = res.headers.get("content-type") || "application/json";
    return new NextResponse(await res.arrayBuffer(), {
      status: res.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-store",
        ...(res.headers.get("content-disposition") && { "Content-Disposition": res.headers.get("content-disposition")! }),
      },
    });
  } catch {
    return NextResponse.json({ message: "Backend unavailable" }, { status: 502 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ externalId: string }> }) {
  const { externalId } = await params;
  const token = portalToken(req);
  if (typeof token !== "string") return token;

  const q = req.nextUrl.searchParams;
  const base = `/api/portal/customers/${encodeURIComponent(externalId)}`;
  const page = q.get("page");
  const status = q.get("status");
  const query = new URLSearchParams({ ...(status && { status }), ...(page && { page }) }).toString();

  switch (q.get("resource") || "billing") {
    case "subscriptions":
      return forward(`${base}/subscriptions`, token);
    case "invoices":
      return forward(`${base}/invoices${query ? `?${query}` : ""}`, token);
    case "payments":
      return forward(`${base}/payments${page ? `?page=${encodeURIComponent(page)}` : ""}`, token);
    case "pdf": {
      const invoiceId = q.get("invoiceId");
      if (!invoiceId) return NextResponse.json({ message: "Missing invoiceId" }, { status: 400 });
      return forward(`${base}/invoices/${encodeURIComponent(invoiceId)}/pdf`, token);
    }
    default:
      return forward(`${base}/billing`, token);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ externalId: string }> }) {
  const { externalId } = await params;
  const token = portalToken(req);
  if (typeof token !== "string") return token;

  const invoiceId = req.nextUrl.searchParams.get("invoiceId");
  if (!invoiceId) return NextResponse.json({ message: "Missing invoiceId" }, { status: 400 });

  let body = "{}";
  try {
    body = (await req.text()) || "{}";
  } catch {
    // no body
  }
  return forward(
    `/api/portal/customers/${encodeURIComponent(externalId)}/invoices/${encodeURIComponent(invoiceId)}/checkout`,
    token,
    { method: "POST", body },
  );
}
