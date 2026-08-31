-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "accessCode" TEXT,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);
