import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { sendPushToUser } from "@/lib/push";

export async function POST(req, { params }) {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const texte = (body.texte || "").trim();
  if (!texte) return NextResponse.json({ error: "Commentaire vide" }, { status: 400 });

  const actor = await prisma.user.findUnique({ where: { id: userId } });
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const task = await prisma.task.findUnique({ where: { id: params.id }, include: { assignee: true, createdBy: true } });
  if (!task) return NextResponse.json({ error: "Tâche introuvable" }, { status: 404 });

  const comment = await prisma.comment.create({
    data: { taskId: task.id, userId: actor.id, texte },
    include: { user: true },
  });

  const targets = new Map();
  if (task.assignee && task.assignee.id !== actor.id) targets.set(task.assignee.id, task.assignee);
  if (task.createdBy && task.createdBy.id !== actor.id) targets.set(task.createdBy.id, task.createdBy);

  for (const target of targets.values()) {
    const message = `${actor.name} a commenté « ${task.titre} »`;
    await prisma.notification.create({
      data: { type: "statut", message, taskId: task.id, toUserId: target.id, fromUserId: actor.id },
    });
    await sendPushToUser(prisma, target.id, { title: "Nouveau commentaire", body: message, url: "/?view=notifs" });
  }

  return NextResponse.json({
    commentaire: { texte: comment.texte, par: comment.user.name, le: comment.createdAt.toISOString() },
  });
}
