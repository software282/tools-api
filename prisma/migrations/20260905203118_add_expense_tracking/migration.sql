-- CreateEnum
CREATE TYPE "ExpenseSource" AS ENUM ('RECEIPT', 'ESTIMATED', 'MANUAL');

-- AlterTable
ALTER TABLE "Part" ADD COLUMN     "lastKnownPrice" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "ExpenseEntry" (
    "id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(10,2) NOT NULL,
    "totalCost" DECIMAL(10,2) NOT NULL,
    "source" "ExpenseSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "teamId" TEXT NOT NULL,
    "partId" TEXT,
    "receiptId" TEXT,

    CONSTRAINT "ExpenseEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseEntry_teamId_partId_idx" ON "ExpenseEntry"("teamId", "partId");

-- CreateIndex
CREATE INDEX "ExpenseEntry_teamId_createdAt_idx" ON "ExpenseEntry"("teamId", "createdAt");

-- AddForeignKey
ALTER TABLE "ExpenseEntry" ADD CONSTRAINT "ExpenseEntry_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseEntry" ADD CONSTRAINT "ExpenseEntry_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseEntry" ADD CONSTRAINT "ExpenseEntry_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
