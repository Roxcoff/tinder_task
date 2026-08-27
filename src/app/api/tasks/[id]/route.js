import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { sendPushToUser } from "@/lib/push";
import { isAdminName } from "@/lib/admin";

const STATUT_LABELS = { a_demarrer: "À démarrer", en_cours: "En cours (bloqué)", termine: "Terminé" };

async function notify(actor, targets, taskId, message) {
  for (const target of targets.values()) {
    await prisma.notification.create({
      data: { type: "statut", message, taskId, toUserId: target.id, fromUserId: actor.id },
    });
    await sendPushToUser(prisma, target.id, { title: "Tâche mise à jour", body: message, url: "/?view=notifs" });
  }
}

export async function PATCH(req, { params }) {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const actor = await prisma.user.findUnique({ where: { id: userId } });
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = isAdminName(actor.name);

  const existing = await prisma.task.findUnique({ where: { id: params.id }, include: { assignee: true, createdBy: true } });
  if (!existing) return NextResponse.json({ error: "Tâche introuvable" }, { status: 404 });

  // --- Réassignation (réservée aux administrateurs) ---
  if (body.assignee !== undefined) {
    if (!admin) return NextResponse.json({ error: "Seul un administrateur peut assigner une tâche" }, { status: 403 });

    let newAssignee = null;
    const name = (body.assignee || "").trim();
    if (name) {
      newAssignee = await prisma.user.upsert({ where: { name }, update: {}, create: { name } });
    }
    const updated = await prisma.task.update({
      where: { id: params.id },
      data: { assigneeId: newAssignee?.id || null },
      include: { assignee: true, createdBy: true },
    });

    if (newAssignee && newAssignee.id !== actor.id) {
      const message = `${actor.name} vous a assigné « ${updated.titre} »`;
      await notify(actor, new Map([[newAssignee.id, newAssignee]]), updated.id, message);
    }
    return NextResponse.json({ ok: true });
  }

  // --- Changement de statut ---
  const statut = body.statut;
  if (!STATUT_LABELS[statut]) {
    return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
  }

  const canAct = admin || !existing.assigneeId || existing.assigneeId === actor.id;
  if (!canAct) {
    return NextResponse.json({ error: "Cette tâche est assignée à quelqu'un d'autre" }, { status: 403 });
  }

  const commentaire = (body.commentaire || "").trim();
  if (statut === "en_cours" && !commentaire) {
    return NextResponse.json({ error: "Un commentaire est requis pour bloquer une tâche" }, { status: 400 });
  }

  const task = await prisma.task.update({
    where: { id: params.id },
    data: {
      statut,
      events: { create: { statut, userId: actor.id } },
      ...(commentaire ? { comments: { create: { texte: commentaire, userId: actor.id } } } : {}),
    },
    include: { assignee: true, createdBy: true },
  });

  const targets = new Map();
  if (task.assignee && task.assignee.id !== actor.id) targets.set(task.assignee.id, task.assignee);
  if (task.createdBy && task.createdBy.id !== actor.id) targets.set(task.createdBy.id, task.createdBy);

  const message = `${actor.name} a mis à jour « ${task.titre} » — ${STATUT_LABELS[statut]}`;
  await notify(actor, targets, task.id, message);

  return NextResponse.json({ ok: true });
}
