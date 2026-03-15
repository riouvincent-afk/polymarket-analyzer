import { NextRequest, NextResponse } from "next/server";

const BACKEND = "http://localhost:8001";

async function proxy(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const target = `${BACKEND}${url.pathname}${url.search}`;

  const isPost = req.method === "POST" || req.method === "PUT" || req.method === "PATCH" || req.method === "DELETE";
  const body = isPost ? await req.text() : undefined;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = req.cookies.get("access_token")?.value;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(target, {
    method: req.method,
    headers,
    body,
    redirect: "follow",
  });

  const data = await res.json();
  const response = NextResponse.json(data, { status: res.status });
  if (res.status === 200 && req.method === "GET") {
    response.headers.set("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
  }
  return response;
}

export const GET    = proxy;
export const POST   = proxy;
export const PUT    = proxy;
export const PATCH  = proxy;
export const DELETE = proxy;
