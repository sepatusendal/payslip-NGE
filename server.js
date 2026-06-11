const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session
app.use(session({
  secret: 'payslip-secret-key-2024-ganti-ini',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 8 * 60 * 60 * 1000 } // 8 jam
}));

// Serve static BEFORE auth middleware (login page, css, js)
app.use(express.static(path.join(__dirname, 'public')));

// Ensure directories exist
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(path.join(__dirname, 'public', 'img')))
  fs.mkdirSync(path.join(__dirname, 'public', 'img'), { recursive: true });

// Initialize default files
const initFile = (filePath, defaultVal) => {
  if (!fs.existsSync(filePath))
    fs.writeFileSync(filePath, JSON.stringify(defaultVal, null, 2));
};

// Users - hash password on first init
const usersFile = path.join(dataDir, 'users.json');
if (!fs.existsSync(usersFile)) {
  const hashed = bcrypt.hashSync('admin123', 10);
  fs.writeFileSync(usersFile, JSON.stringify([
    { id: 1, username: 'admin', password: hashed, name: 'Administrator', role: 'admin', createdAt: new Date().toISOString() }
  ], null, 2));
  console.log('✅ Default user created: admin / admin123');
}

initFile(path.join(dataDir, 'settings.json'), {
  companyName: 'PT Maju Bersama Indonesia',
  companyAddress: 'Jl. Sudirman No. 123, Jakarta Selatan 12190',
  companyPhone: '021-5551234',
  companyEmail: 'hrd@majubersama.co.id',
  companyNPWP: '01.234.567.8-901.000',
  logo: null,
  smtp: { host: 'smtp.gmail.com', port: 587, user: '', pass: '', from: '' },
  currency: 'IDR',
  pph21Method: 'gross',
  bpjsKesehatan: { employee: 1, employer: 4 },
  bpjsKetenagakerjaan: { jht_employee: 2, jht_employer: 3.7, jp_employee: 1, jp_employer: 2, jkk: 0.24, jkm: 0.3 }
});
initFile(path.join(dataDir, 'employees.json'), []);
initFile(path.join(dataDir, 'payslips.json'), []);

// ─── Auth Middleware for API ───────────────────────────────────
app.use('/api', (req, res, next) => {
  // Allow login endpoint without auth
  if (req.path === '/auth/login') return next();
  // Check session
  if (!req.session || !req.session.user) {
    return res.status(401).json({ success: false, message: 'Sesi berakhir. Silakan login.', redirect: '/login' });
  }
  next();
});

// ─── Routes ───────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/settings',  require('./routes/settings'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/payslip',   require('./routes/payslip'));
app.use('/api/email',     require('./routes/email'));
app.use('/api/export',    require('./routes/export'));

// ─── Page Routes ──────────────────────────────────────────────
app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 Payslip App running at http://localhost:${PORT}`);
  console.log(`🔐 Default login: admin / admin123`);
  console.log(`📋 Open: http://localhost:${PORT}\n`);
});
