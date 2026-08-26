import webpush from "web-push";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const { VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn(
      "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY manquantes — les notifications push sont désactivées. " +
        "Générez-les avec `npx web-push generate-vapid-keys`."
    );
    return;
  }
  webpush.setVapidDetails(
    VAPID_SUBJECT || "mailto:contact@example.com",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  configured = true;
}

/**
 * Envoie une notification push à tous les appareils abonnés d'un utilisateur.
 * Supprime automatiquement les abonnements expirés (410/404).
 */
export async function sendPushToUser(prisma, userId, payload) {
  ensureConfigured();
  if (!configured) return;

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error("Échec d'envoi push:", err.message || err);
        }
      }
    })
  );
}
