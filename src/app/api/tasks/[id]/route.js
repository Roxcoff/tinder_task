import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { sendPushToUser } from "@/lib/push";

const STATUT_LABELS = { a_demarrer: "À démarrer", en_cours: "En cours", termine: "Terminé" };

export async function PATCH(req, { params }) {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const statut = body.statut;
  if (!STATUT_LABELS[statut]) {
    return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
  }

  const actor = await prisma.user.findUnique({ where: { id: userId } });
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const existing = await prisma.task.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Tâche introuvable" }, { status: 404 });

  const task = await prisma.task.update({
    where: { id: params.id },
    data: { statut, events: { create: { statut, userId: actor.id } } },
    include: { assignee: true, createdBy: true },
  });

  const targets = new Map();
  if (task.assignee && task.assignee.id !== actor.id) targets.set(task.assignee.id, task.assignee);
  if (task.createdBy && task.createdBy.id !== actor.id) targets.set(task.createdBy.id, task.createdBy);

  for (const target of targets.values()) {
    const message = `${actor.name} a mis à jour « ${task.titre} » — ${STATUT_LABELS[statut]}`;
    await prisma.notification.create({
      data: {
        type: "statut",
        message,
        taskId: task.id,
        toUserId: target.id,
        fromUserId: actor.id,
      },
    });
    await sendPushToUser(prisma, target.id, {
      title: "Tâche mise à jour",
      body: message,
      url: "/?view=notifs",
    });
  }

  return NextResponse.json({ ok: true });
}
