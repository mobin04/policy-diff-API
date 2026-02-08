CREATE TABLE pages (
     id SERIAL PRIMARY KEY,
     url TEXT UNIQUE NOT NULL,
     created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE page_versions (
     id SERIAL PRIMARY KEY,
     page_id INTEGER REFERENCES pages(id),
     content TEXT NOT NULL,
     created_at TIMESTAMP DEFAULT NOW()
);









