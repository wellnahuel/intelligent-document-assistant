-- Sprint 5 lexical retrieval. The expression must match the query expression
-- exactly (`to_tsvector('simple', "content")`) so PostgreSQL can use the index.
-- GIN adds storage and write cost, but it keeps full-text search from scanning
-- every chunk as the corpus grows. `simple` is language-agnostic: it lowercases
-- and tokenizes without a Spanish/Italian stemmer or stopword dictionary.
CREATE INDEX "DocumentChunk_content_simple_fts_idx"
ON "DocumentChunk"
USING GIN (to_tsvector('simple', "content"));
