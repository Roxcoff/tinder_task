-- CreateTable
CREATE TABLE "PendingStatusNotification" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "statut" "Statut" NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingStatusNotification_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PendingStatusNotification" ADD CONSTRAINT "PendingStatusNotification_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingStatusNotification" ADD CONSTRAINT "PendingStatusNotification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
