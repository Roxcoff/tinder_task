import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { isAdminName } from "@/lib/admin";

async function requireAdmin() {
  const userId = getSessionUserId();
  if (!userId) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const actor = await prisma.user.findUnique({ where: { id: userId } });
  if (!actor || !isAdminName(actor.name)) {
    return { error: NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 }) };
  }
  return { actor };
}

function serialize(u) {
  return { id: u.id, name: u.name, assignable: u.assignable, isAdmin: isAdminName(u.name) };
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ users: users.map(serialize) });
}

export async function POST(req) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Nom requis" }, { status: 400 });

  const user = await prisma.user.upsert({
    where: { name },
    update: { assignable: true },
    create: { name, assignable: true },
  });
  return NextResponse.json({ user: serialize(user) });
}

export async function PATCH(req) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const data = {};
  if (body.assignable !== undefined) data.assignable = !!body.assignable;
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "Nom requis" }, { status: 400 });
    data.name = name;
  }

  try {
    const user = await prisma.user.update({ where: { id: body.id }, data });
    return NextResponse.json({ user: serialize(user) });
  } catch (e) {
    if (e.code === "P2002") return NextResponse.json({ error: "Ce nom est déjà utilisé" }, { status: 409 });
    throw e;
  }
}
