'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || (IS_PROD ? '' : crypto.randomBytes(32).toString('hex'));
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (IS_PROD ? '' : 'ChangeMe123!');
if (!SESSION_SECRET || !ADMIN_PASSWORD) throw new Error('SESSION_SECRET and ADMIN_PASSWORD are required in production');

const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'store.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

const now = () => new Date().toISOString();
const id = prefix => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const safeNum = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => ({
  salt,
  hash: crypto.scryptSync(password, salt, 64).toString('hex')
});
const verifyPassword = (password, record) => {
  const actual = crypto.scryptSync(password, record.salt, 64);
  const expected = Buffer.from(record.hash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

function seed() {
  const pass = hashPassword(ADMIN_PASSWORD);
  return {
    schemaVersion: 1,
    users: [{ id: 'usr_admin', email: ADMIN_EMAIL, name: 'Venue Owner', role: 'owner', password: pass, active: true, createdAt: now() }],
    sessions: [],
    venue: { id: 'venue_main', name: 'Pineyard Event Venue', timezone: 'Asia/Kuala_Lumpur', currency: 'MYR', phone: '+60125212257', address: 'Janda Baik, Pahang', defaultBufferMinutes: 120 },
    spaces: [
      { id: 'space_hall', name: 'Main Hall', capacity: 250, active: true },
      { id: 'space_garden', name: 'Garden', capacity: 180, active: true },
      { id: 'space_bridal', name: 'Bridal Room', capacity: 12, active: true }
    ],
    packages: [
      { id: 'pkg_wedding', name: 'Forest Celebration', eventType: 'Wedding', price: 12800, durationHours: 6, active: true },
      { id: 'pkg_corporate', name: 'Full-Day Gathering', eventType: 'Corporate', price: 6200, durationHours: 8, active: true }
    ],
    customers: [], enquiries: [], bookings: [], payments: [], tasks: [], audit: []
  };
}
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify(seed(), null, 2));
const readDb = () => JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const writeDb = db => {
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
};

const json = (res, status, data, extra = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(data));
};
const parseCookies = req => Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(part => {
  const i = part.indexOf('='); return [decodeURIComponent(part.slice(0, i).trim()), decodeURIComponent(part.slice(i + 1))];
}));
const parseBody = req => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', chunk => { raw += chunk; if (raw.length > 1_000_000) reject(new Error('Request too large')); });
  req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } });
});
const clientIp = req => clean((req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0], 80);
const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');
const sessionCookie = token => `venue_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${IS_PROD ? '; Secure' : ''}`;
const clearCookie = () => `venue_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${IS_PROD ? '; Secure' : ''}`;
const csrf = () => crypto.randomBytes(24).toString('base64url');
const loginAttempts = new Map();

function auth(req, db) {
  const token = parseCookies(req).venue_session;
  if (!token) return null;
  const s = db.sessions.find(x => x.tokenHash === tokenHash(token) && x.expiresAt > Date.now());
  if (!s) return null;
  const user = db.users.find(x => x.id === s.userId && x.active);
  return user ? { user, session: s } : null;
}
function audit(db, actorId, action, entityType, entityId, details = {}) {
  db.audit.unshift({ id: id('aud'), actorId, action, entityType, entityId, details, createdAt: now() });
  db.audit = db.audit.slice(0, 2000);
}
function overlaps(aStart, aEnd, bStart, bEnd) { return aStart < bEnd && aEnd > bStart; }
function hasConflict(db, candidate, excludeId = null) {
  return db.bookings.some(b => b.id !== excludeId && ['hold', 'confirmed'].includes(b.status) && b.spaceIds.some(s => candidate.spaceIds.includes(s)) && overlaps(candidate.startAt, candidate.endAt, b.startAt, b.endAt));
}
function serveStatic(res, pathname) {
  const map = { '/': 'index.html', '/app.js': 'app.js', '/styles.css': 'styles.css', '/manifest.webmanifest': 'manifest.webmanifest' };
  const file = map[pathname];
  if (!file) return false;
  const full = path.join(ROOT, 'public', file);
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json' };
  res.writeHead(200, { 'Content-Type': types[path.extname(full)] || 'application/octet-stream', 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'", 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
  fs.createReadStream(full).pipe(res); return true;
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = url.pathname;
    if (req.method === 'GET' && serveStatic(res, p)) return;
    if (p === '/api/health') return json(res, 200, { ok: true, service: 'venue-os', time: now() });

    let db = readDb();
    if (req.method === 'POST' && p === '/api/login') {
      const key = clientIp(req); const record = loginAttempts.get(key) || { count: 0, until: 0 };
      if (record.until > Date.now()) return json(res, 429, { error: 'Too many attempts. Try again later.' });
      const body = await parseBody(req); const email = clean(body.email, 160).toLowerCase();
      const user = db.users.find(x => x.email === email && x.active);
      if (!user || !verifyPassword(String(body.password || ''), user.password)) {
        record.count += 1; if (record.count >= 5) { record.until = Date.now() + 15 * 60_000; record.count = 0; } loginAttempts.set(key, record);
        return json(res, 401, { error: 'Invalid email or password' });
      }
      loginAttempts.delete(key);
      const token = crypto.randomBytes(32).toString('base64url');
      const s = { id: id('ses'), userId: user.id, tokenHash: tokenHash(token), csrf: csrf(), expiresAt: Date.now() + 8 * 60 * 60_000, createdAt: now(), ip: key };
      db.sessions = db.sessions.filter(x => x.expiresAt > Date.now()); db.sessions.push(s); audit(db, user.id, 'login', 'session', s.id); writeDb(db);
      return json(res, 200, { user: { id: user.id, name: user.name, email: user.email, role: user.role }, csrf: s.csrf }, { 'Set-Cookie': sessionCookie(token) });
    }
    if (req.method === 'POST' && p === '/api/logout') {
      const a = auth(req, db); if (a) { db.sessions = db.sessions.filter(x => x.id !== a.session.id); audit(db, a.user.id, 'logout', 'session', a.session.id); writeDb(db); }
      return json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
    }
    const a = auth(req, db);
    if (!a) return json(res, 401, { error: 'Authentication required' });
    if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-csrf-token'] !== a.session.csrf) return json(res, 403, { error: 'Invalid CSRF token' });

    if (req.method === 'GET' && p === '/api/session') return json(res, 200, { user: { id: a.user.id, name: a.user.name, email: a.user.email, role: a.user.role }, csrf: a.session.csrf });
    if (req.method === 'GET' && p === '/api/bootstrap') return json(res, 200, { venue: db.venue, spaces: db.spaces, packages: db.packages, customers: db.customers, enquiries: db.enquiries, bookings: db.bookings, payments: db.payments, tasks: db.tasks, audit: db.audit.slice(0, 100) });

    if (req.method === 'POST' && p === '/api/enquiries') {
      const b = await parseBody(req);
      const customer = { id: id('cus'), name: clean(b.customerName, 120), email: clean(b.email, 160), phone: clean(b.phone, 40), company: clean(b.company, 120), createdAt: now() };
      if (!customer.name || !customer.phone) return json(res, 400, { error: 'Customer name and phone are required' });
      db.customers.push(customer);
      const enquiry = { id: id('enq'), reference: `ENQ-${Date.now().toString(36).toUpperCase()}`, customerId: customer.id, eventType: clean(b.eventType, 80), preferredDate: clean(b.preferredDate, 10), guests: safeNum(b.guests), budget: safeNum(b.budget), source: clean(b.source || 'Website', 80), status: 'new', notes: clean(b.notes, 1500), assignedTo: a.user.id, createdAt: now(), updatedAt: now() };
      db.enquiries.unshift(enquiry); audit(db, a.user.id, 'create', 'enquiry', enquiry.id, { reference: enquiry.reference }); writeDb(db); return json(res, 201, enquiry);
    }
    if (req.method === 'PATCH' && p.startsWith('/api/enquiries/')) {
      const eid = p.split('/').pop(); const e = db.enquiries.find(x => x.id === eid); if (!e) return json(res, 404, { error: 'Not found' }); const b = await parseBody(req);
      for (const k of ['status', 'notes', 'preferredDate', 'eventType']) if (b[k] !== undefined) e[k] = clean(b[k], k === 'notes' ? 1500 : 100); e.updatedAt = now(); audit(db, a.user.id, 'update', 'enquiry', e.id); writeDb(db); return json(res, 200, e);
    }
    if (req.method === 'POST' && p === '/api/bookings') {
      const b = await parseBody(req); const startAt = new Date(b.startAt).toISOString(); const endAt = new Date(b.endAt).toISOString();
      const booking = { id: id('bok'), reference: `BK-${Date.now().toString(36).toUpperCase()}`, customerId: clean(b.customerId, 80), enquiryId: clean(b.enquiryId, 80), title: clean(b.title, 160), eventType: clean(b.eventType, 80), startAt, endAt, spaceIds: Array.isArray(b.spaceIds) ? b.spaceIds.filter(x => db.spaces.some(s => s.id === x)) : [], guests: safeNum(b.guests), packageId: clean(b.packageId, 80), status: ['hold', 'confirmed', 'maintenance'].includes(b.status) ? b.status : 'hold', value: safeNum(b.value), depositRequired: safeNum(b.depositRequired), holdExpiresAt: b.holdExpiresAt ? new Date(b.holdExpiresAt).toISOString() : null, notes: clean(b.notes, 1500), createdAt: now(), updatedAt: now() };
      if (!booking.title || !booking.customerId || booking.spaceIds.length === 0 || startAt >= endAt) return json(res, 400, { error: 'Complete the booking details' });
      if (hasConflict(db, booking)) return json(res, 409, { error: 'This space has a conflicting hold or confirmed event' });
      db.bookings.push(booking); audit(db, a.user.id, 'create', 'booking', booking.id, { reference: booking.reference, status: booking.status }); writeDb(db); return json(res, 201, booking);
    }
    if (req.method === 'PATCH' && p.startsWith('/api/bookings/')) {
      const bid = p.split('/').pop(); const booking = db.bookings.find(x => x.id === bid); if (!booking) return json(res, 404, { error: 'Not found' }); const before = { ...booking }; const b = await parseBody(req);
      for (const k of ['title', 'eventType', 'status', 'notes']) if (b[k] !== undefined) booking[k] = clean(b[k], k === 'notes' ? 1500 : 160);
      for (const k of ['value', 'depositRequired', 'guests']) if (b[k] !== undefined) booking[k] = safeNum(b[k]);
      if (b.startAt) booking.startAt = new Date(b.startAt).toISOString(); if (b.endAt) booking.endAt = new Date(b.endAt).toISOString(); if (Array.isArray(b.spaceIds)) booking.spaceIds = b.spaceIds;
      if (hasConflict(db, booking, booking.id)) { Object.assign(booking, before); return json(res, 409, { error: 'Schedule conflict' }); }
      booking.updatedAt = now(); audit(db, a.user.id, 'update', 'booking', booking.id, { before: before.status, after: booking.status }); writeDb(db); return json(res, 200, booking);
    }
    if (req.method === 'POST' && p === '/api/payments') {
      const b = await parseBody(req); const payment = { id: id('pay'), bookingId: clean(b.bookingId, 80), amount: safeNum(b.amount), method: clean(b.method, 60), reference: clean(b.reference, 120), status: ['paid', 'pending', 'refunded'].includes(b.status) ? b.status : 'paid', paidAt: b.paidAt ? new Date(b.paidAt).toISOString() : now(), createdAt: now() };
      if (!db.bookings.some(x => x.id === payment.bookingId) || payment.amount <= 0) return json(res, 400, { error: 'Valid booking and amount required' });
      db.payments.unshift(payment); audit(db, a.user.id, 'create', 'payment', payment.id, { amount: payment.amount }); writeDb(db); return json(res, 201, payment);
    }
    if (req.method === 'POST' && p === '/api/tasks') {
      const b = await parseBody(req); const task = { id: id('tsk'), bookingId: clean(b.bookingId, 80), title: clean(b.title, 180), dueAt: b.dueAt ? new Date(b.dueAt).toISOString() : null, assigneeId: clean(b.assigneeId || a.user.id, 80), status: 'open', priority: ['low', 'medium', 'high'].includes(b.priority) ? b.priority : 'medium', createdAt: now() };
      if (!task.title) return json(res, 400, { error: 'Task title required' }); db.tasks.unshift(task); audit(db, a.user.id, 'create', 'task', task.id); writeDb(db); return json(res, 201, task);
    }
    if (req.method === 'PATCH' && p.startsWith('/api/tasks/')) {
      const tid = p.split('/').pop(); const task = db.tasks.find(x => x.id === tid); if (!task) return json(res, 404, { error: 'Not found' }); const b = await parseBody(req); if (b.status) task.status = clean(b.status, 30); if (b.title) task.title = clean(b.title, 180); audit(db, a.user.id, 'update', 'task', task.id); writeDb(db); return json(res, 200, task);
    }
    if (req.method === 'GET' && p === '/api/export.csv') {
      const rows = db.bookings.map(b => ({ reference: b.reference, title: b.title, startAt: b.startAt, endAt: b.endAt, status: b.status, guests: b.guests, value: b.value, customer: db.customers.find(c => c.id === b.customerId)?.name || '' }));
      const keys = Object.keys(rows[0] || { reference: '' }); const esc = v => `"${String(v ?? '').replaceAll('"', '""')}"`;
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="venue-bookings.csv"' }); return res.end([keys.join(','), ...rows.map(r => keys.map(k => esc(r[k])).join(','))].join('\n'));
    }
    return json(res, 404, { error: 'Not found' });
  } catch (error) { console.error(error); return json(res, 500, { error: IS_PROD ? 'Server error' : error.message }); }
}).listen(PORT, () => console.log(`Venue OS running on http://localhost:${PORT}`));
