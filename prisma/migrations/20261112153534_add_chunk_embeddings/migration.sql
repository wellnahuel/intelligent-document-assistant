-- pgvector must exist before the vector(384) column can be created.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "ChunkEmbedding" (
    "id" TEXT NOT NULL,
    "chunkId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelRevision" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "embedding" vector(384) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChunkEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChunkEmbedding_modelId_modelRevision_idx" ON "ChunkEmbedding"("modelId", "modelRevision");

-- CreateIndex
CREATE UNIQUE INDEX "ChunkEmbedding_chunkId_modelId_modelRevision_key" ON "ChunkEmbedding"("chunkId", "modelId", "modelRevision");

-- AddForeignKey
ALTER TABLE "ChunkEmbedding" ADD CONSTRAINT "ChunkEmbedding_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "DocumentChunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;
