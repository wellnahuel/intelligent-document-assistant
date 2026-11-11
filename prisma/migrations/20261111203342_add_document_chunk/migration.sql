-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "documentPageId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "startChar" INTEGER NOT NULL,
    "endChar" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentChunk_documentPageId_idx" ON "DocumentChunk"("documentPageId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentChunk_documentPageId_chunkIndex_key" ON "DocumentChunk"("documentPageId", "chunkIndex");

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentPageId_fkey" FOREIGN KEY ("documentPageId") REFERENCES "DocumentPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
