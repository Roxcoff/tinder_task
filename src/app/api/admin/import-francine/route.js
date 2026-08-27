import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Enrichit les tâches déjà seedées (roadmap 45 jours) avec les informations de la
// Fiche de mission de Francine : assignation + étapes concrètes en notes. Ajoute
// aussi la seule tâche de sa fiche absente de la roadmap (gestion quotidienne, en continu).
const UPDATES = [
  {
    match: { titre: "Réaliser l'inventaire documentaire complet", programme: "mkd" },
    notes:
      "Pilote : Francine. Constituer un dossier physique complet par bien (photos et documents imprimés, organisés et référencés). Étapes : récupérer le fichier de référence des biens ; acheter les fournitures (classeurs, chemises, étiquettes) ; imprimer et organiser documents/photos bien par bien ; voir M. Adam pour les éléments fiscaux de chaque bien ; mettre en place un rangement centralisé.",
  },
  {
    match: { titre: "Cartographier et évaluer l'état des biens", programme: "mkd" },
    notes:
      "Pilote : Francine. Phase Abidjan. Étapes : lister les biens à Abidjan et planifier les visites ; organiser l'accès aux terrains (gardiens, voisinage) ; photos et observations par bien ; consolider dans le référentiel patrimonial.",
  },
  {
    match: { titre: "Sécuriser les biens prioritaires", programme: "mkd" },
    notes:
      "Pilote : Francine. Étapes : diagnostic de vulnérabilité par bien prioritaire ; identifier la solution adaptée (prêt à usage, clôture, gardiennage...) ; obtenir des devis ; mettre en œuvre et suivre.",
  },
  {
    match: { titre: "Trier les biens mobiliers et définir leur devenir", programme: "mkd" },
    notes:
      "Appui/accompagnement : Francine (réalisé avec un expert externe, 24→30 sept.). Étapes : assurer le lien et la prise de RDV avec l'expert ; préparer les informations et accès nécessaires ; suivre ses recommandations.",
  },
  {
    match: { titre: "Valoriser le patrimoine", programme: "mkd" },
    notes:
      "Appui/accompagnement : Francine (réalisé avec un expert externe, 24→30 sept.). Étapes : assurer le lien et la prise de RDV avec l'expert ; préparer les informations et accès nécessaires ; suivre ses recommandations.",
  },
  {
    match: { titre: "Reconstituer les dossiers contractuels par bien (contrats, loyers dus)", programme: "mizzy" },
    notes:
      "Pilote : Francine. Étapes : lister les biens actuellement loués ; retrouver le contrat de chaque bien ; vérifier la conformité avec le registre ; relancer les contrats manquants ; intégrer la fiche d'imposition et suivre la situation fiscale.",
  },
  {
    match: { titre: "Structurer les offres locatives des biens gérés", programme: "mizzy" },
    notes: "Appui/accompagnement : Francine. Positionnement, conditions, documents contractuels types.",
  },
  {
    match: { titre: "Finaliser l'immatriculation et la conformité juridique de la société", programme: "mizzy" },
    notes:
      "Pilote : Francine. Étapes : rassembler les pièces nécessaires ; engager la démarche en ligne (ex. 225invest) ; suivre jusqu'à obtention du récépissé / immatriculation définitive.",
  },
  {
    match: { titre: "Rendre les bureaux opérationnels", programme: "mizzy" },
    notes:
      "Co-pilote (à 3) : Francine. Étapes : lister le matériel manquant (informatique, mobilier, fournitures) ; l'acheter ; aménager les espaces ; récupérer et installer les tableaux.",
  },
];

const NEW_TASK = {
  programme: "mizzy",
  chantier: "Gestion quotidienne et locative",
  titre: "Assurer la gestion quotidienne des biens locatifs",
  notes:
    "Pilote : Francine. En continu — coordination avec Maître Dieu (immeuble Trilium) et Angelo/Boris (autres biens). Faire remonter sans délai les points d'attention et anomalies.",
};

export async function GET(req) {
  const key = req.nextUrl.searchParams.get("key");
  if (!process.env.SESSION_SECRET || key !== process.env.SESSION_SECRET) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const francine = await prisma.user.upsert({
    where: { name: "Francine" },
    update: {},
    create: { name: "Francine" },
  });

  const updated = [];
  const notFound = [];
  for (const { match, notes } of UPDATES) {
    const task = await prisma.task.findFirst({ where: match });
    if (!task) {
      notFound.push(match.titre);
      continue;
    }
    await prisma.task.update({ where: { id: task.id }, data: { assigneeId: francine.id, notes } });
    updated.push(task.titre);
  }

  let created = null;
  const existingNew = await prisma.task.findFirst({ where: { titre: NEW_TASK.titre, programme: NEW_TASK.programme } });
  if (!existingNew) {
    const task = await prisma.task.create({
      data: {
        programme: NEW_TASK.programme,
        chantier: NEW_TASK.chantier,
        titre: NEW_TASK.titre,
        notes: NEW_TASK.notes,
        statut: "a_demarrer",
        assigneeId: francine.id,
        createdById: francine.id,
        events: { create: { statut: "a_demarrer", userId: francine.id } },
      },
    });
    created = task.titre;
  }

  return NextResponse.json({ updated, notFound, created: created || "déjà présente" });
}
