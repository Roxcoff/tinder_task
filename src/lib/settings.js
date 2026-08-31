// Paramètres globaux modifiables par un admin depuis l'application (voir
// /api/admin/settings), stockés dans une ligne unique. Le code d'accès de
// process.env.ACCESS_CODE reste le filet de sécurité par défaut tant
// qu'aucun admin n'a défini/écrasé de code depuis l'appli.
export async function getSetting(prisma) {
  return prisma.setting.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function getAccessCode(prisma) {
  const setting = await prisma.setting.findUnique({ where: { id: "singleton" } });
  // null = jamais configuré depuis l'appli → variable d'env par défaut.
  // Une chaîne vide est une valeur explicite ("aucun code requis") qui
  // prime sur la variable d'env.
  if (setting && setting.accessCode !== null) return setting.accessCode;
  return process.env.ACCESS_CODE || "";
}
