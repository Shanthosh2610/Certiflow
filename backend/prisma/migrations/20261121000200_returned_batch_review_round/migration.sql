ALTER TABLE "Batch" ADD COLUMN "reviewRound" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "BatchApproval" ADD COLUMN "reviewRound" INTEGER NOT NULL DEFAULT 1;

DROP INDEX "BatchApproval_batchId_officerId_stage_key";

CREATE UNIQUE INDEX "BatchApproval_batchId_officerId_stage_reviewRound_key"
ON "BatchApproval"("batchId", "officerId", "stage", "reviewRound");
