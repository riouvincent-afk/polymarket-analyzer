import { NextRequest, NextResponse } from "next/server";

const BACKEND = "http://localhost:8001";

async function proxy(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const target = `${BACKEND}${url.pathname}${url.search}`;

  const isPost = req.method === "POST";
  const body = isPost ? await req.text() : undefined;

  const res = await fetch(target, {
    method: req.method,
    headers: { "Content-Type": "application/json" },
    body,
    redirect: "follow",
  });

  const data = await res.json();
  const response = NextResponse.json(data, { status: res.status });
  // Let the browser and Next.js edge cache serve stale data instantly
  if (res.status === 200 && req.method === "GET") {
    response.headers.set("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
  }
  return response;
}

export const GET  = proxy;
export const POST = proxy;
