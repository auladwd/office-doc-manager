const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Initialize database first
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_PATH = process.env.UPLOAD_PATH || path.join(__dirname, 'data', 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_PATH)) {
  fs.mkdirSync(UPLOAD_PATH, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Make upload path available to routes
app.set('uploadPath', UPLOAD_PATH);
app.set('db', db);

// Routes
const documentsRouter = require('./routes/documents');
app.use('/api', documentsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve uploaded files
app.get('/files/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(UPLOAD_PATH, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'ফাইল পাওয়া যায়নি' });
  }

  // Determine content type
  const ext = path.extname(filename).toLowerCase();
  const contentTypes = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff'
  };

  const contentType = contentTypes[ext] || 'application/octet-stream';

  // Support inline preview for pdf and images
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(filename)}"`);
  res.sendFile(filePath);
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'সার্ভারে সমস্যা হয়েছে',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 অফিস ডকুমেন্ট ম্যানেজার সার্ভার চালু হয়েছে — Port: ${PORT}`);
  console.log(`📁 আপলোড ফোল্ডার: ${UPLOAD_PATH}`);
});
