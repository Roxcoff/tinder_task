import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

export async function GET() {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({
    users: users.map((u) => u.name),
    assignable: users.filter((u) => u.assignable).map((u) => u.name),
  });
}
