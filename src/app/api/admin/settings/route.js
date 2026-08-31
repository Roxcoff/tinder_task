import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { isAdminName } from "@/lib/admin";
import { getSetting } from "@/lib/settings";

async function requireAdmin() {
  const userId = getSessionUserId();
  if (!userId) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const actor = await prisma.user.findUnique({ where: { id: userId } });
  if (!actor || !isAdminName(actor.name)) {
    return { error: NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 }) };
  }
  return { actor };
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const setting = await getSetting(prisma);
  return NextResponse.json({
    // accessCode: null = suit la variable d'env ACCESS_CODE du serveur ;
    // une chaîne (vide ou non) écrase explicitement cette variable.
    accessCode: setting.accessCode,
    accessCodeFromEnv: !!process.env.ACCESS_CODE,
  });
}

export async function PATCH(req) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  if (!("accessCode" in body)) return NextResponse.json({ error: "accessCode requis" }, { status: 400 });

  // null remet le comportement par défaut (variable d'env / aucun code) ;
  // toute chaîne (y compris vide) devient la valeur explicite.
  const accessCode = body.accessCode === null ? null : String(body.accessCode).trim();

  const setting = await prisma.setting.upsert({
    where: { id: "singleton" },
    update: { accessCode },
    create: { id: "singleton", accessCode },
  });

  return NextResponse.json({ accessCode: setting.accessCode });
}
