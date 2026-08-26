import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

export async function GET() {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const notifs = await prisma.notification.findMany({
    where: { toUserId: userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    notifications: notifs.map((n) => ({
      id: n.id,
      type: n.type,
      message: n.message,
      creeLe: n.createdAt.toISOString(),
      lu: !!n.readAt,
    })),
  });
}
