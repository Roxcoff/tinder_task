const { PrismaClient } = require("@prisma/client");
const { runSeed } = require("../src/lib/seed-data");
const prisma = new PrismaClient();

async function main() {
  const result = await runSeed(prisma);
  if (!result.seeded) {
    console.log(`La base contient déjà ${result.existing} tâche(s), seed ignoré.`);
    return;
  }
  console.log(`${result.count} tâches importées depuis la roadmap.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
