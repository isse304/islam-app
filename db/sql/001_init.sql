-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Table for storing tafsir document chunks
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT CHECK (source IN ('ibn-kathir', 'tabari', 'qurtubi', 'baghawi', 'sadi')),
    surah INT NOT NULL,
    ayah INT NOT NULL,
    lang TEXT CHECK (lang IN ('ar', 'en')) NOT NULL DEFAULT 'en',
    text TEXT NOT NULL,
    has_asbab BOOLEAN DEFAULT FALSE,
    mentions_ijma BOOLEAN DEFAULT FALSE,
    mentions_minority BOOLEAN DEFAULT FALSE,
    is_majority BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (source, surah, ayah, lang)
);

-- Table for storing document embeddings
CREATE TABLE IF NOT EXISTS embeddings (
    document_id UUID PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    embedding VECTOR(1536) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for storing keywords extracted from documents
CREATE TABLE IF NOT EXISTS keywords (
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    term TEXT NOT NULL,
    weight REAL DEFAULT 1.0,
    PRIMARY KEY (document_id, term)
);

-- Table for tracking background jobs (e.g., embedding generation)
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    meta JSONB DEFAULT '{}'
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS documents_surah_ayah_idx ON documents(surah, ayah);
CREATE INDEX IF NOT EXISTS documents_source_surah_ayah_idx ON documents(source, surah, ayah);
CREATE INDEX IF NOT EXISTS documents_tsv_idx ON documents USING GIN (to_tsvector('simple', text));
CREATE INDEX IF NOT EXISTS keywords_term_idx ON keywords(term);
CREATE INDEX IF NOT EXISTS embeddings_ivf_idx ON embeddings USING IVFFLAT (embedding vector_cosine_ops) WITH (lists = 100);
