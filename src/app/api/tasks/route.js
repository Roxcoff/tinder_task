import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { sendPushToUser } from "@/lib/push";
import { isAdminName } from "@/lib/admin";

function serialize(task) {
  const historique = (task.events || []).map((e) => ({
    statut: e.statut,
    par: e.user?.name || "",
    le: e.createdAt.toISOString(),
  }));
  const demarree = historique.find((h) => h.statut === "en_cours");

  return {
    id: task.id,
    programme: task.programme,
    chantier: task.chantier,
    titre: task.titre,
    echeance: task.echeance ? task.echeance.toISOString().slice(0, 10) : "",
    statut: task.statut,
    notes: task.notes || "",
    personnelle: task.personnelle,
    assignees: (task.assignees || []).map((u) => u.name),
    creePar: task.createdBy?.name || "",
    creeLe: task.createdAt.toISOString(),
    demarreeLe: demarree ? demarree.le : null,
    historique,
    commentaires: (task.comments || []).map((c) => ({
      texte: c.texte,
      par: c.user?.name || "",
      le: c.createdAt.toISOString(),
    })),
  };
}

// Une nouvelle personne devient assignable uniquement quand c'est un admin
// qui l'assigne explicitement — se contenter de taper un nom ici ne suffit
// pas à polluer la liste d'assignation pour tout le monde.
async function upsertUsers(names, { markAssignable = false } = {}) {
  const clean = [...new Set((names || []).map((n) => (n || "").trim()).filter(Boolean))];
  const users = [];
  for (const name of clean) {
    users.push(
      await prisma.user.upsert({
        where: { name },
        update: markAssignable ? { assignable: true } : {},
        create: markAssignable ? { name, assignable: true } : { name },
      })
    );
  }
  return users;
}

export async function GET() {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tasks = await prisma.task.findMany({
    where: { archived: false, OR: [{ personnelle: false }, { createdById: userId }] },
    include: {
      assignees: true,
      createdBy: true,
      events: { include: { user: true }, orderBy: { createdAt: "asc" } },
      comments: { include: { user: true }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ tasks: tasks.map(serialize) });
}

export async function POST(req) {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (!body.titre || !body.titre.trim()) {
    return NextResponse.json({ error: "Intitulé requis" }, { status: 400 });
  }
  if (!["mkd", "serenity", "mizzy"].includes(body.programme)) {
    return NextResponse.json({ error: "Programme invalide" }, { status: 400 });
  }

  const actor = await prisma.user.findUnique({ where: { id: userId } });
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const assignees = await upsertUsers(body.assignees, { markAssignable: isAdminName(actor.name) });

  const task = await prisma.task.create({
    data: {
      programme: body.programme,
      chantier: (body.chantier || "Non classé").trim(),
      titre: body.titre.trim(),
      echeance: body.echeance ? new Date(body.echeance) : null,
      notes: body.notes || "",
      personnelle: !!body.personnelle,
      assignees: { connect: assignees.map((u) => ({ id: u.id })) },
      createdById: actor.id,
      events: { create: { statut: "a_demarrer", userId: actor.id } },
    },
    include: {
      assignees: true,
      createdBy: true,
      events: { include: { user: true } },
      comments: { include: { user: true } },
    },
  });

  for (const assignee of assignees) {
    if (assignee.id === actor.id) continue;
    const message = `${actor.name} vous a assigné « ${task.titre} »`;
    const notif = await prisma.notification.create({
      data: {
        type: "assignation",
        message,
        taskId: task.id,
        toUserId: assignee.id,
        fromUserId: actor.id,
      },
    });
    await sendPushToUser(prisma, assignee.id, {
      title: "Nouvelle tâche assignée",
      body: notif.message,
      url: "/?view=notifs",
    });
  }

  return NextResponse.json({ task: serialize(task) });
}
