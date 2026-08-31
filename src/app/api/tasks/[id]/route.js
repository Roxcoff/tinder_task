import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { sendPushToUser } from "@/lib/push";
import { isAdminName } from "@/lib/admin";
import { STATUT_LABELS, queueStatusNotification } from "@/lib/statusNotify";

async function notify(actor, targets, taskId, message) {
  for (const target of targets.values()) {
    await prisma.notification.create({
      data: { type: "statut", message, taskId, toUserId: target.id, fromUserId: actor.id },
    });
    await sendPushToUser(prisma, target.id, { title: "Tâche mise à jour", body: message, url: "/?view=notifs" });
  }
}

async function upsertUsers(names) {
  const clean = [...new Set((names || []).map((n) => (n || "").trim()).filter(Boolean))];
  const users = [];
  for (const name of clean) {
    users.push(await prisma.user.upsert({ where: { name }, update: {}, create: { name } }));
  }
  return users;
}

async function applyAssignees(taskId, titre, actor, previousAssigneeIds, newAssignees) {
  await prisma.task.update({
    where: { id: taskId },
    data: { assignees: { set: newAssignees.map((u) => ({ id: u.id })) } },
  });
  const added = newAssignees.filter((u) => !previousAssigneeIds.has(u.id) && u.id !== actor.id);
  if (added.length) {
    const message = `${actor.name} vous a assigné « ${titre} »`;
    await notify(actor, new Map(added.map((u) => [u.id, u])), taskId, message);
  }
}

export async function DELETE(req, { params }) {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const actor = await prisma.user.findUnique({ where: { id: userId } });
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = isAdminName(actor.name);

  const existing = await prisma.task.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Tâche introuvable" }, { status: 404 });

  const canEdit = admin || existing.createdById === actor.id;
  if (!canEdit) {
    return NextResponse.json({ error: "Seul le créateur ou un administrateur peut supprimer cette tâche" }, { status: 403 });
  }

  await prisma.task.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req, { params }) {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const actor = await prisma.user.findUnique({ where: { id: userId } });
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = isAdminName(actor.name);

  const existing = await prisma.task.findUnique({ where: { id: params.id }, include: { assignees: true, createdBy: true } });
  if (!existing) return NextResponse.json({ error: "Tâche introuvable" }, { status: 404 });
  const canEdit = admin || existing.createdById === actor.id;
  const previousAssigneeIds = new Set(existing.assignees.map((u) => u.id));

  // --- Archivage / désarchivage (créateur ou admin) ---
  if (body.archived !== undefined) {
    if (!canEdit) return NextResponse.json({ error: "Seul le créateur ou un administrateur peut archiver cette tâche" }, { status: 403 });
    await prisma.task.update({ where: { id: params.id }, data: { archived: !!body.archived } });
    return NextResponse.json({ ok: true });
  }

  // --- Modification des champs de la tâche (créateur ou admin) ---
  if (body.edit) {
    if (!canEdit) return NextResponse.json({ error: "Seul le créateur ou un administrateur peut modifier cette tâche" }, { status: 403 });
    const e = body.edit;
    if (!e.titre || !e.titre.trim()) return NextResponse.json({ error: "Intitulé requis" }, { status: 400 });
    if (!["mkd", "serenity", "mizzy"].includes(e.programme)) return NextResponse.json({ error: "Programme invalide" }, { status: 400 });

    const data = {
      titre: e.titre.trim(),
      programme: e.programme,
      chantier: (e.chantier || "Non classé").trim(),
      echeance: e.echeance ? new Date(e.echeance) : null,
      notes: e.notes || "",
      personnelle: !!e.personnelle,
    };

    await prisma.task.update({ where: { id: params.id }, data });

    if (admin && e.assignees !== undefined) {
      const newAssignees = await upsertUsers(e.assignees);
      await applyAssignees(params.id, data.titre, actor, previousAssigneeIds, newAssignees);
    }
    return NextResponse.json({ ok: true });
  }

  // --- Réassignation (réservée aux administrateurs) ---
  if (body.assignees !== undefined) {
    if (!admin) return NextResponse.json({ error: "Seul un administrateur peut assigner une tâche" }, { status: 403 });
    const newAssignees = await upsertUsers(body.assignees);
    await applyAssignees(params.id, existing.titre, actor, previousAssigneeIds, newAssignees);
    return NextResponse.json({ ok: true });
  }

  // --- Changement de statut ---
  const statut = body.statut;
  if (!STATUT_LABELS[statut]) {
    return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
  }

  const canAct = admin || existing.assignees.length === 0 || previousAssigneeIds.has(actor.id);
  if (!canAct) {
    return NextResponse.json({ error: "Cette tâche est assignée à quelqu'un d'autre" }, { status: 403 });
  }

  const commentaire = (body.commentaire || "").trim();
  if (statut === "bloque" && !commentaire) {
    return NextResponse.json({ error: "Un commentaire est requis pour bloquer une tâche" }, { status: 400 });
  }

  const task = await prisma.task.update({
    where: { id: params.id },
    data: {
      statut,
      events: { create: { statut, userId: actor.id } },
      ...(commentaire ? { comments: { create: { texte: commentaire, userId: actor.id } } } : {}),
    },
    include: { assignees: true, createdBy: true },
  });

  const targets = new Map();
  for (const a of task.assignees) if (a.id !== actor.id) targets.set(a.id, a);
  if (task.createdBy && task.createdBy.id !== actor.id) targets.set(task.createdBy.id, task.createdBy);

  const message = `${actor.name} a mis à jour « ${task.titre} » — ${STATUT_LABELS[statut]}`;
  await notify(actor, targets, task.id, message);
  await queueStatusNotification(prisma, task.id, statut, actor.id);

  return NextResponse.json({ ok: true });
}
