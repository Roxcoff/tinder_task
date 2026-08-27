import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

const PROGRAMMES = {
  mkd: { label: "Succession MKD", color: "FF1C2F66" },
  serenity: { label: "Serenity SA", color: "FF0F9D74" },
  mizzy: { label: "MIZZY & Co", color: "FFA9752E" },
};
const STATUTS = {
  a_demarrer: { label: "À démarrer", color: "FFEAEDF9" },
  en_cours: { label: "Bloqué", color: "FFFBF1DE" },
  termine: { label: "Terminé", color: "FFE3F6EE" },
};

export async function GET() {
  const userId = getSessionUserId();
  if (!userId) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

  const tasks = await prisma.task.findMany({
    where: { OR: [{ personnelle: false }, { createdById: userId }] },
    include: {
      assignee: true,
      createdBy: true,
      events: { orderBy: { createdAt: "asc" } },
      comments: true,
    },
    orderBy: [{ programme: "asc" }, { echeance: "asc" }],
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Le tri des tâches";
  workbook.created = new Date();

  // --- Feuille Synthèse ---
  const synth = workbook.addWorksheet("Synthèse");
  synth.columns = [
    { header: "Programme", key: "programme", width: 24 },
    { header: "Total", key: "total", width: 10 },
    { header: "À démarrer", key: "a", width: 12 },
    { header: "Bloquées", key: "b", width: 12 },
    { header: "Terminées", key: "c", width: 12 },
    { header: "% terminé", key: "pct", width: 12 },
    { header: "En retard", key: "retard", width: 12 },
  ];
  synth.getRow(1).font = { bold: true };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const [key, prog] of Object.entries(PROGRAMMES)) {
    const items = tasks.filter((t) => t.programme === key);
    const a = items.filter((t) => t.statut === "a_demarrer").length;
    const b = items.filter((t) => t.statut === "en_cours").length;
    const c = items.filter((t) => t.statut === "termine").length;
    const retard = items.filter((t) => t.echeance && t.statut !== "termine" && t.echeance < today).length;
    const row = synth.addRow({
      programme: prog.label,
      total: items.length,
      a,
      b,
      c,
      pct: items.length ? `${Math.round((c / items.length) * 100)}%` : "0%",
      retard,
    });
    row.getCell("programme").fill = { type: "pattern", pattern: "solid", fgColor: { argb: prog.color } };
    row.getCell("programme").font = { color: { argb: "FFFFFFFF" }, bold: true };
  }

  // --- Feuille Tâches ---
  const sheet = workbook.addWorksheet("Tâches");
  sheet.columns = [
    { header: "Programme", key: "programme", width: 20 },
    { header: "Chantier", key: "chantier", width: 30 },
    { header: "Tâche", key: "titre", width: 42 },
    { header: "Statut", key: "statut", width: 14 },
    { header: "Assignée à", key: "assignee", width: 18 },
    { header: "Échéance", key: "echeance", width: 13 },
    { header: "Démarrée le", key: "demarree", width: 13 },
    { header: "Créée par", key: "creePar", width: 16 },
    { header: "Personnelle", key: "personnelle", width: 12 },
    { header: "Commentaires", key: "commentaires", width: 13 },
    { header: "Notes", key: "notes", width: 40 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = "A1:K1";

  for (const t of tasks) {
    const demarree = t.events.find((e) => e.statut === "en_cours");
    const row = sheet.addRow({
      programme: PROGRAMMES[t.programme]?.label || t.programme,
      chantier: t.chantier,
      titre: t.titre,
      statut: STATUTS[t.statut]?.label || t.statut,
      assignee: t.assignee?.name || "",
      echeance: t.echeance ? t.echeance.toISOString().slice(0, 10) : "",
      demarree: demarree ? demarree.createdAt.toISOString().slice(0, 10) : "",
      creePar: t.createdBy?.name || "",
      personnelle: t.personnelle ? "Oui" : "",
      commentaires: t.comments.length,
      notes: t.notes || "",
    });
    const fill = STATUTS[t.statut]?.color;
    if (fill) row.getCell("statut").fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `le-tri-des-taches-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
