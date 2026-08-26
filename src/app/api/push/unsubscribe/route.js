import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  if (!body.endpoint) return NextResponse.json({ error: "endpoint requis" }, { status: 400 });

  await prisma.pushSubscription.delete({ where: { endpoint: body.endpoint } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
