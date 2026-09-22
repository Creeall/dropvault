const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 8080);
const MAX_FILE_SIZE = 3 * 1024 * 1024 * 1024;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'files.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me';
const sessions = new Set();
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function readFiles() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { return []; }
}
function writeFiles(files) { fs.writeFileSync(DB_FILE, JSON.stringify(files, null, 2)); }
function id() { return crypto.randomUUID(); }
function token() { return crypto.randomBytes(18).toString('base64url'); }
function expiryFromPlan(plan) {
  const days = plan === 'month' ? 30 : 7;
  return new Date(Date.now() + days * 86400000).toISOString();
}
function publicBase(req) { return process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`; }
function safeFileName(name) { return path.basename(name).replace(/[^a-zA-Z0-9._ -]/g, '_'); }

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${id()}-${safeFileName(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: MAX_FILE_SIZE } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function sessionId(req) { return req.headers.cookie?.match(/(?:^|;)\s*dv_session=([^;]+)/)?.[1]; }
function isAuthed(req) { const session = sessionId(req); return Boolean(session && sessions.has(session)); }
function requireAuth(req, res, next) { if (!isAuthed(req)) return res.status(401).json({ error: 'Authentication required.' }); next(); }

app.post('/api/login', (req, res) => {
  if (!req.body || req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Incorrect password.' });
  const session = crypto.randomBytes(32).toString('hex'); sessions.add(session);
  res.setHeader('Set-Cookie', `dv_session=${session}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`);
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => { const session = sessionId(req); if (session) sessions.delete(session); res.setHeader('Set-Cookie', 'dv_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); res.json({ ok: true }); });
app.get('/api/me', (req, res) => res.json({ authenticated: isAuthed(req) }));

app.get('/api/config', requireAuth, (_req, res) => res.json({ maxFileSize: MAX_FILE_SIZE, smtpEnabled: Boolean(process.env.SMTP_HOST) }));

app.get('/api/files', requireAuth, (_req, res) => {
  const now = Date.now();
  const files = readFiles().map(f => ({
    ...f,
    expired: new Date(f.expiresAt).getTime() <= now,
    shareUrl: `${publicBase(_req)}/s/${f.token}`
  })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(files);
});

app.post('/api/files', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Select a file to upload.' });
  const plan = req.body.expiry === 'month' ? 'month' : 'week';
  const record = {
    id: id(), originalName: req.file.originalname, storedName: req.file.filename,
    mimeType: req.file.mimetype || 'application/octet-stream', size: req.file.size,
    createdAt: new Date().toISOString(), expiresAt: expiryFromPlan(plan), expiryPlan: plan,
    token: token(), downloads: [], lastDownloadedAt: null
  };
  const files = readFiles(); files.push(record); writeFiles(files);
  res.status(201).json({ ...record, shareUrl: `${publicBase(req)}/s/${record.token}` });
});

app.patch('/api/files/:id', requireAuth, (req, res) => {
  const files = readFiles(); const file = files.find(f => f.id === req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found.' });
  if (req.body.expiry === 'week' || req.body.expiry === 'month') { file.expiryPlan = req.body.expiry; file.expiresAt = expiryFromPlan(req.body.expiry); }
  writeFiles(files); res.json(file);
});

app.post('/api/files/:id/renew', requireAuth, (req, res) => {
  const files = readFiles(); const file = files.find(f => f.id === req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found.' });
  file.token = token(); file.expiresAt = expiryFromPlan(file.expiryPlan || 'week');
  writeFiles(files); res.json({ ...file, shareUrl: `${publicBase(req)}/s/${file.token}` });
});

app.delete('/api/files/:id', requireAuth, (req, res) => {
  const files = readFiles(); const index = files.findIndex(f => f.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: 'File not found.' });
  const [file] = files.splice(index, 1); writeFiles(files);
  fs.rm(path.join(UPLOAD_DIR, file.storedName), { force: true }, () => {});
  res.status(204).end();
});

app.get('/s/:token', async (req, res) => {
  const files = readFiles(); const file = files.find(f => f.token === req.params.token);
  if (!file || new Date(file.expiresAt).getTime() <= Date.now()) return res.status(404).send('This link has expired or is no longer available.');
  const absolute = path.join(UPLOAD_DIR, file.storedName);
  if (!fs.existsSync(absolute)) return res.status(404).send('File is unavailable.');
  const email = String(req.query.email || req.get('x-download-email') || '').trim();
  const entry = { at: new Date().toISOString(), email: email || null, ip: req.ip };
  file.downloads = file.downloads || []; file.downloads.push(entry); file.lastDownloadedAt = entry.at; writeFiles(files);
  await notifyDownload(file, entry, req);
  res.download(absolute, file.originalName);
});

async function notifyDownload(file, entry, req) {
  if (!process.env.SMTP_HOST || !process.env.NOTIFY_EMAIL) return;
  const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined });
  try { await transporter.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: process.env.NOTIFY_EMAIL, subject: `Download: ${file.originalName}`, text: `${file.originalName} was downloaded at ${entry.at}.\nEmail: ${entry.email || 'not provided'}\nIP: ${entry.ip}\nLink: ${publicBase(req)}/s/${file.token}` }); } catch (error) { console.error('Notification email failed:', error.message); }
}

app.use((_req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.listen(PORT, () => console.log(`DropVault listening on port ${PORT}`));
