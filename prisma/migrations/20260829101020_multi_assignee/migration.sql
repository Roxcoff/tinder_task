-- CreateTable
CREATE TABLE "_assignees" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- Preserve existing single-assignee data into the new join table
INSERT INTO "_assignees" ("A", "B")
SELECT "id", "assigneeId" FROM "Task" WHERE "assigneeId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_assigneeId_fkey";

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "assigneeId";

-- CreateIndex
CREATE UNIQUE INDEX "_assignees_AB_unique" ON "_assignees"("A", "B");

-- CreateIndex
CREATE INDEX "_assignees_B_index" ON "_assignees"("B");

-- AddForeignKey
ALTER TABLE "_assignees" ADD CONSTRAINT "_assignees_A_fkey" FOREIGN KEY ("A") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_assignees" ADD CONSTRAINT "_assignees_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
