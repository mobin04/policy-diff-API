CREATE TABLE IF NOT EXISTS pages (
     id SERIAL PRIMARY KEY,
     url TEXT UNIQUE NOT NULL,
     created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS page_versions (
     id SERIAL PRIMARY KEY,
     page_id INTEGER REFERENCES pages(id),
     content TEXT NOT NULL,
     content_hash TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMP DEFAULT NOW()
);

-- Migration for existing tables
ALTER TABLE page_versions ADD COLUMN IF NOT EXISTS content_hash TEXT NOT NULL DEFAULT '';
