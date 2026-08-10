const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'office_docs.db');

// Ensure directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    memo_no     TEXT,
    doc_date    TEXT,
    subject     TEXT NOT NULL,
    category    TEXT DEFAULT 'সাধারণ',
    from_party  TEXT,
    to_party    TEXT,
    notes       TEXT,
    tags        TEXT DEFAULT '[]',
    file_name   TEXT,
    file_path   TEXT,
    file_type   TEXT,
    file_size   INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at  TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT UNIQUE NOT NULL
  );
`);

// Insert default categories
const defaultCategories = [
  'সাধারণ চিঠি',
  'অফিস আদেশ',
  'প্রজ্ঞাপন',
  'প্রতিবেদন',
  'দরপত্র',
  'চুক্তিপত্র',
  'আবেদন',
  'বিজ্ঞপ্তি',
  'নোটিশ',
  'অন্যান্য'
];

const insertCategory = db.prepare(
  'INSERT OR IGNORE INTO categories (name) VALUES (?)'
);

const insertMany = db.transaction((cats) => {
  for (const cat of cats) insertCategory.run(cat);
});
insertMany(defaultCategories);

// Create FTS5 virtual table for full-text search
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
    memo_no,
    subject,
    from_party,
    to_party,
    notes,
    tags,
    content=documents,
    content_rowid=id,
    tokenize='unicode61'
  );

  CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
    INSERT INTO documents_fts(rowid, memo_no, subject, from_party, to_party, notes, tags)
    VALUES (new.id, new.memo_no, new.subject, new.from_party, new.to_party, new.notes, new.tags);
  END;

  CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, memo_no, subject, from_party, to_party, notes, tags)
    VALUES ('delete', old.id, old.memo_no, old.subject, old.from_party, old.to_party, old.notes, old.tags);
  END;

  CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, memo_no, subject, from_party, to_party, notes, tags)
    VALUES ('delete', old.id, old.memo_no, old.subject, old.from_party, old.to_party, old.notes, old.tags);
    INSERT INTO documents_fts(rowid, memo_no, subject, from_party, to_party, notes, tags)
    VALUES (new.id, new.memo_no, new.subject, new.from_party, new.to_party, new.notes, new.tags);
  END;
`);

console.log(`✅ Database initialized at: ${DB_PATH}`);

module.exports = db;
