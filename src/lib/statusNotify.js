import { sendPushToUser } from "@/lib/push";

export const STATUT_LABELS = { a_demarrer: "À démarrer", en_cours: "En cours", bloque: "Bloqué", termine: "Terminé" };

// Délai avant de notifier les utilisateurs qui ne sont ni assignés ni
// créateurs de la tâche (eux sont notifiés immédiatement ailleurs). Laisse
// le temps à un changement de statut fait par erreur d'être corrigé sans
// déclencher de notification pour tout le monde.
const DELAY_MS = 30 * 60 * 1000;

// Remplace toute notification en attente pour cette tâche : seul le
// dernier statut compte si plusieurs changements ont lieu dans la fenêtre.
export async function queueStatusNotification(prisma, taskId, statut, actorId) {
  await prisma.pendingStatusNotification.deleteMany({ where: { taskId } });
  await prisma.pendingStatusNotification.create({ data: { taskId, statut, actorId } });
}

export async function flushDueStatusNotifications(prisma) {
  const cutoff = new Date(Date.now() - DELAY_MS);
  const due = await prisma.pendingStatusNotification.findMany({
    where: { createdAt: { lte: cutoff } },
    include: { task: { include: { assignees: true } }, actor: true },
  });
  if (!due.length) return;

  for (const p of due) {
    if (p.task) {
      const excluded = new Set([p.actorId, p.task.createdById, ...p.task.assignees.map((a) => a.id)]);
      const targets = await prisma.user.findMany({ where: { id: { notIn: [...excluded] } } });
      const label = STATUT_LABELS[p.statut] || p.statut;
      const message = `${p.actor.name} a mis à jour « ${p.task.titre} » — ${label}`;
      for (const target of targets) {
        await prisma.notification.create({
          data: { type: "statut", message, taskId: p.taskId, toUserId: target.id, fromUserId: p.actorId },
        });
        await sendPushToUser(prisma, target.id, { title: "Tâche mise à jour", body: message, url: "/?view=notifs" });
      }
    }
    await prisma.pendingStatusNotification.delete({ where: { id: p.id } }).catch(() => {});
  }
}
