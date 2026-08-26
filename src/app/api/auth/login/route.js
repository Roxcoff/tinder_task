import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/session";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const name = (body.name || "").trim();
  const code = body.code || "";

  if (!name) {
    return NextResponse.json({ error: "Nom requis" }, { status: 400 });
  }
  if (process.env.ACCESS_CODE && code !== process.env.ACCESS_CODE) {
    return NextResponse.json({ error: "Code d'accès invalide" }, { status: 401 });
  }

  const user = await prisma.user.upsert({
    where: { name },
    update: {},
    create: { name },
  });

  setSessionCookie(user.id);
  return NextResponse.json({ user: { id: user.id, name: user.name } });
}
