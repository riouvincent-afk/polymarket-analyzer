import { NextRequest, NextResponse } from "next/server";

const BACKEND = "http://localhost:8000";

async function proxy(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const target = `${BACKEND}${url.pathname}${url.search}`;

  const res = await fetch(target, {
    method: req.method,
    headers: { "Content-Type": "application/json" },
    redirect: "follow",
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export const GET = proxy;
