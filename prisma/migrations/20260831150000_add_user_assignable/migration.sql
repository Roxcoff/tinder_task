-- AlterTable
ALTER TABLE "User" ADD COLUMN "assignable" BOOLEAN NOT NULL DEFAULT false;

-- Les personnes déjà présentes restent assignables (comportement inchangé) ;
-- seules les personnes qui se connecteront pour la première fois après
-- cette migration démarreront masquées, en attente d'activation par un
-- administrateur.
UPDATE "User" SET "assignable" = true;
