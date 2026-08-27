// [programme, chantier, titre, echeance, statut]
const SEED_TASKS = [
  ["mkd", "Structuration juridique et fiscale", "Sélectionner le cabinet et les conseils juridiques et fiscaux", "2026-09-02", "en_cours"],
  ["serenity", "Chiffrage de la prestation", "Élaborer et transmettre le chiffrage de la prestation de consulting", "2026-09-03", "a_demarrer"],
  ["mkd", "Inventaire, cartographie et valorisation", "Créer le référentiel digital des biens", "2026-09-04", "en_cours"],
  ["mizzy", "Gestion quotidienne et locative", "Créer l'outil de gestion et de suivi locatif", "2026-09-06", "en_cours"],
  ["serenity", "Plan quinquennal de développement", "Cadrer les priorités avec le PDG", "2026-09-07", "a_demarrer"],
  ["mizzy", "Formalités et fonctionnement", "Finaliser l'immatriculation et la conformité juridique de la société", "2026-09-08", "en_cours"],
  ["serenity", "Actions prioritaires à court terme", "Mini audit des états financiers et interviews", "2026-09-08", "a_demarrer"],
  ["mkd", "Structuration juridique et fiscale", "Formaliser les volontés et les objectifs de la famille", "2026-09-08", "en_cours"],
  ["serenity", "Plan quinquennal de développement", "Construire l'architecture du Plan quinquennal et la méthodologie d'action", "2026-09-01", "a_demarrer"],
  ["mkd", "Inventaire, cartographie et valorisation", "Réaliser l'inventaire documentaire complet", "2026-09-10", "a_demarrer"],
  ["serenity", "Actions prioritaires à court terme", "Identifier les leviers de réduction des frais généraux", "2026-09-12", "a_demarrer"],
  ["serenity", "Réaménagement des locaux", "Visite des locaux actuels", "2026-09-13", "a_demarrer"],
  ["mizzy", "Gestion quotidienne et locative", "Reconstituer les dossiers contractuels par bien (contrats, loyers dus)", "2026-09-14", "a_demarrer"],
  ["mkd", "Structuration juridique et fiscale", "Préparer en amont les schémas et scénarios familiaux souhaités", "2026-09-14", "a_demarrer"],
  ["mizzy", "Formalités et fonctionnement", "Rendre les bureaux opérationnels", "2026-09-16", "a_demarrer"],
  ["mkd", "Inventaire, cartographie et valorisation", "Cartographier et évaluer l'état des biens", "2026-09-16", "a_demarrer"],
  ["serenity", "Actions prioritaires à court terme", "Lancer des actions de développement commercial", "2026-09-17", "a_demarrer"],
  ["mizzy", "Gestion quotidienne et locative", "Structurer les offres locatives des biens gérés", "2026-09-20", "a_demarrer"],
  ["serenity", "Plan quinquennal de développement", "Réaliser un diagnostic à 360° du marché (proposition)", "2026-09-20", "a_demarrer"],
  ["mkd", "Inventaire, cartographie et valorisation", "Sécuriser les biens prioritaires", "2026-09-20", "a_demarrer"],
  ["serenity", "Actions prioritaires à court terme", "Identifier les produits d'assurance à haut potentiel", "2026-09-21", "a_demarrer"],
  ["mkd", "Structuration juridique et fiscale", "Challenger les scénarios avec les experts", "2026-09-22", "a_demarrer"],
  ["serenity", "Réaménagement des locaux", "Définir le scénario d'aménagement", "2026-09-24", "a_demarrer"],
  ["mkd", "Inventaire, cartographie et valorisation", "Trier les biens mobiliers et définir leur devenir", "2026-09-24", "a_demarrer"],
  ["mizzy", "Gestion quotidienne et locative", "Assurer le suivi fiscal de chaque bien", "2026-09-26", "a_demarrer"],
  ["mkd", "Structuration juridique et fiscale", "Adopter et valider une stratégie juridique, fiscale et patrimoniale", "2026-09-28", "a_demarrer"],
  ["mkd", "Inventaire, cartographie et valorisation", "Valoriser le patrimoine", "2026-09-30", "a_demarrer"],
];

async function runSeed(prisma) {
  const existing = await prisma.task.count({
    where: { titre: { in: SEED_TASKS.map((t) => t[2]) } },
  });
  if (existing > 0) {
    return { seeded: false, existing };
  }

  const system = await prisma.user.upsert({
    where: { name: "Roadmap initiale" },
    update: {},
    create: { name: "Roadmap initiale" },
  });

  for (const [programme, chantier, titre, echeance, statut] of SEED_TASKS) {
    await prisma.task.create({
      data: {
        programme,
        chantier,
        titre,
        echeance: new Date(echeance),
        statut,
        createdById: system.id,
        events: { create: { statut, userId: system.id } },
      },
    });
  }

  return { seeded: true, count: SEED_TASKS.length };
}

module.exports = { SEED_TASKS, runSeed };
