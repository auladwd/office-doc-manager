const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// ── Multer storage ──────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = req.app.get('uploadPath');
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${uuidv4()}${ext}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/tiff'
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('শুধু PDF এবং Image ফাইল (JPG, PNG, GIF, WEBP, TIFF) আপলোড করা যাবে'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 52428800 } // 50MB
});

// ── Helper ──────────────────────────────────────────────────────────────────
function getDb(req) {
  return req.app.get('db');
}

function formatDoc(doc) {
  if (!doc) return null;
  return {
    ...doc,
    tags: doc.tags ? JSON.parse(doc.tags) : []
  };
}

// ── GET /api/health ──────────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ── GET /api/stats ────────────────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  const db = getDb(req);
  try {
    const total = db.prepare('SELECT COUNT(*) as count FROM documents').get();
    const today = db.prepare(
      "SELECT COUNT(*) as count FROM documents WHERE date(created_at) = date('now', 'localtime')"
    ).get();
    const byCategory = db.prepare(
      'SELECT category, COUNT(*) as count FROM documents GROUP BY category ORDER BY count DESC'
    ).all();
    const recent = db.prepare(
      'SELECT id, memo_no, subject, category, doc_date, file_type, created_at FROM documents ORDER BY created_at DESC LIMIT 5'
    ).all();

    res.json({
      total: total.count,
      today: today.count,
      byCategory,
      recent: recent.map(formatDoc)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/categories ───────────────────────────────────────────────────────
router.get('/categories', (req, res) => {
  const db = getDb(req);
  try {
    const cats = db.prepare('SELECT name FROM categories ORDER BY name').all();
    res.json(cats.map(c => c.name));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/categories ──────────────────────────────────────────────────────
router.post('/categories', (req, res) => {
  const db = getDb(req);
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'ক্যাটাগরির নাম দিন' });
  try {
    db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)').run(name.trim());
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/documents ────────────────────────────────────────────────────────
router.get('/documents', (req, res) => {
  const db = getDb(req);
  const {
    q,           // full-text search
    memo_no,
    category,
    from_party,
    to_party,
    date_from,
    date_to,
    page = 1,
    limit = 20,
    sort = 'created_at',
    order = 'DESC'
  } = req.query;

  try {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const allowedSorts = ['created_at', 'doc_date', 'memo_no', 'subject', 'category'];
    const sortCol = allowedSorts.includes(sort) ? sort : 'created_at';
    const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';

    let ids = null;

    // Full-text search via FTS5
    if (q && q.trim()) {
      const ftsQuery = q.trim().split(/\s+/).map(t => `"${t}"*`).join(' OR ');
      const ftsRows = db.prepare(
        `SELECT rowid FROM documents_fts WHERE documents_fts MATCH ? ORDER BY rank`
      ).all(ftsQuery);
      ids = ftsRows.map(r => r.rowid);
      if (ids.length === 0) {
        return res.json({ documents: [], total: 0, page: parseInt(page), pages: 0 });
      }
    }

    // Build WHERE clause
    const conditions = [];
    const params = [];

    if (ids) {
      conditions.push(`id IN (${ids.join(',')})`);
    }
    if (memo_no) {
      conditions.push('memo_no LIKE ?');
      params.push(`%${memo_no}%`);
    }
    if (category) {
      conditions.push('category = ?');
      params.push(category);
    }
    if (from_party) {
      conditions.push('from_party LIKE ?');
      params.push(`%${from_party}%`);
    }
    if (to_party) {
      conditions.push('to_party LIKE ?');
      params.push(`%${to_party}%`);
    }
    if (date_from) {
      conditions.push('doc_date >= ?');
      params.push(date_from);
    }
    if (date_to) {
      conditions.push('doc_date <= ?');
      params.push(date_to);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = db.prepare(`SELECT COUNT(*) as count FROM documents ${where}`).get(...params);
    const total = countRow.count;

    const docs = db.prepare(
      `SELECT id, memo_no, subject, category, doc_date, from_party, to_party,
              file_name, file_type, file_size, tags, created_at
       FROM documents ${where}
       ORDER BY ${sortCol} ${sortOrder}
       LIMIT ? OFFSET ?`
    ).all(...params, parseInt(limit), offset);

    res.json({
      documents: docs.map(formatDoc),
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/documents/:id ────────────────────────────────────────────────────
router.get('/documents/:id', (req, res) => {
  const db = getDb(req);
  try {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'ডকুমেন্ট পাওয়া যায়নি' });
    res.json(formatDoc(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/documents ───────────────────────────────────────────────────────
router.post('/documents', upload.single('file'), (req, res) => {
  const db = getDb(req);
  try {
    const { memo_no, doc_date, subject, category, from_party, to_party, notes, tags } = req.body;

    if (!subject || !subject.trim()) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'বিষয় / শিরোনাম আবশ্যক' });
    }

    const tagsArr = tags
      ? (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : tags)
      : [];

    const stmt = db.prepare(`
      INSERT INTO documents (memo_no, doc_date, subject, category, from_party, to_party, notes, tags, file_name, file_path, file_type, file_size)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      memo_no || null,
      doc_date || null,
      subject.trim(),
      category || 'সাধারণ',
      from_party || null,
      to_party || null,
      notes || null,
      JSON.stringify(tagsArr),
      req.file ? req.file.filename : null,
      req.file ? req.file.path : null,
      req.file ? (req.file.mimetype.startsWith('image/') ? 'image' : 'pdf') : null,
      req.file ? req.file.size : 0
    );

    const newDoc = db.prepare('SELECT * FROM documents WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(formatDoc(newDoc));
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/documents/:id ────────────────────────────────────────────────────
router.put('/documents/:id', upload.single('file'), (req, res) => {
  const db = getDb(req);
  try {
    const existing = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'ডকুমেন্ট পাওয়া যায়নি' });

    const { memo_no, doc_date, subject, category, from_party, to_party, notes, tags } = req.body;

    const tagsArr = tags
      ? (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : tags)
      : JSON.parse(existing.tags || '[]');

    let fileName = existing.file_name;
    let filePath = existing.file_path;
    let fileType = existing.file_type;
    let fileSize = existing.file_size;

    // Replace file if new one uploaded
    if (req.file) {
      if (existing.file_path && fs.existsSync(existing.file_path)) {
        fs.unlinkSync(existing.file_path);
      }
      fileName = req.file.filename;
      filePath = req.file.path;
      fileType = req.file.mimetype.startsWith('image/') ? 'image' : 'pdf';
      fileSize = req.file.size;
    }

    db.prepare(`
      UPDATE documents SET
        memo_no = ?, doc_date = ?, subject = ?, category = ?,
        from_party = ?, to_party = ?, notes = ?, tags = ?,
        file_name = ?, file_path = ?, file_type = ?, file_size = ?,
        updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      memo_no || existing.memo_no,
      doc_date || existing.doc_date,
      subject ? subject.trim() : existing.subject,
      category || existing.category,
      from_party !== undefined ? from_party : existing.from_party,
      to_party !== undefined ? to_party : existing.to_party,
      notes !== undefined ? notes : existing.notes,
      JSON.stringify(tagsArr),
      fileName, filePath, fileType, fileSize,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    res.json(formatDoc(updated));
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/documents/:id ─────────────────────────────────────────────────
router.delete('/documents/:id', (req, res) => {
  const db = getDb(req);
  try {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'ডকুমেন্ট পাওয়া যায়নি' });

    // Delete physical file
    if (doc.file_path && fs.existsSync(doc.file_path)) {
      fs.unlinkSync(doc.file_path);
    }

    db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'ডকুমেন্ট মুছে ফেলা হয়েছে' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
