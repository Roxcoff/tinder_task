import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSeed } from "@/lib/seed-data";

export async function GET(req) {
  const key = req.nextUrl.searchParams.get("key");
  if (!process.env.SESSION_SECRET || key !== process.env.SESSION_SECRET) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const result = await runSeed(prisma);
  if (!result.seeded) {
    return NextResponse.json({ message: `La base contient déjà ${result.existing} tâche(s), seed ignoré.` });
  }
  return NextResponse.json({ message: `${result.count} tâches importées depuis la roadmap.` });
}
