CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE "material_chunks" ADD COLUMN "embedding" vector(1024);
ALTER TABLE "material_chunks" ADD COLUMN "content_tsv" tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', coalesce("content", ''))) STORED;
CREATE INDEX "material_chunks_embedding_hnsw_idx" ON "material_chunks" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX "material_chunks_content_tsv_gin_idx" ON "material_chunks" USING gin ("content_tsv");
