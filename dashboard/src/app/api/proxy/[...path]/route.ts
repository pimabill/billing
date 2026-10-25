import { NextRequest, NextResponse } from "next/server";
import { backendFor, currentEnvironment, refreshAccessToken, sessionToken } from "@/lib/server/session";

async function makeBackendRequest(
  url: string,
  method: string,
  token: string,
  body?: string,
  idempotencyKey?: string | null,
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  // Lets money-moving requests from the dashboard be retried safely.
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  if (method !== "GET" && method !== "HEAD") {
    headers["Content-Type"] = "application/json";
  }

  const fetchOptions: RequestInit = { method, headers };

  if (method !== "GET" && method !== "HEAD" && body) {
    fetchOptions.body = body;
  }

  return fetch(url, fetchOptions);
}

async function proxyRequest(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const apiPath = `/api/${path.join("/")}`;
  // Live or sandbox: the same dashboard talks to whichever this browser switched to.
  const env = await currentEnvironment();
  const token = (await sessionToken(env)) ?? (await refreshAccessToken(env));

  if (!token) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  // Build target URL with query params
  const url = new URL(apiPath, backendFor(env));
  const searchParams = req.nextUrl.searchParams;
  searchParams.forEach((value, key) => url.searchParams.set(key, value));

  // Read body once for potential retry
  let body: string | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const text = await req.text();
    if (text) body = text;
  }

  try {
    const idempotencyKey = req.headers.get("idempotency-key");
    let res = await makeBackendRequest(url.toString(), req.method, token, body, idempotencyKey);

    // If 401, attempt token refresh and retry
    if (res.status === 401) {
      const newToken = await refreshAccessToken(env);
      if (newToken) {
        res = await makeBackendRequest(
          url.toString(),
          req.method,
          newToken,
          body,
          idempotencyKey,
        );
      }
    }

    const contentType = res.headers.get("Content-Type") || "application/json";

    // Handle binary responses (PDFs, images, etc.)
    if (
      contentType.includes("application/pdf") ||
      contentType.includes("application/octet-stream") ||
      contentType.includes("image/")
    ) {
      const arrayBuffer = await res.arrayBuffer();
      return new NextResponse(arrayBuffer, {
        status: res.status,
        headers: {
          "Content-Type": contentType,
          ...(res.headers.get("Content-Disposition")
            ? { "Content-Disposition": res.headers.get("Content-Disposition")! }
            : {}),
        },
      });
    }

    const responseBody = await res.text();
    return new NextResponse(responseBody, {
      status: res.status,
      headers: {
        "Content-Type": contentType,
      },
    });
  } catch {
    return NextResponse.json(
      { message: "Backend unavailable" },
      { status: 502 },
    );
  }
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(req, ctx);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(req, ctx);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(req, ctx);
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(req, ctx);
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(req, ctx);
}
