const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const usersFile = path.join(dataDir, 'users.json');

const readUsers = () => JSON.parse(fs.readFileSync(usersFile));
const writeUsers = (d) => fs.writeFileSync(usersFile, JSON.stringify(d, null, 2));

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ success: false, message: 'Username dan password wajib diisi.' });

  const users = readUsers();
  const user = users.find(u => u.username === username.toLowerCase().trim());
  if (!user)
    return res.status(401).json({ success: false, message: 'Username atau password salah.' });

  const match = await bcrypt.compare(password, user.password);
  if (!match)
    return res.status(401).json({ success: false, message: 'Username atau password salah.' });

  // Save to session
  req.session.user = { id: user.id, username: user.username, name: user.name, role: user.role };
  res.json({ success: true, message: 'Login berhasil!', user: req.session.user });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false, message: 'Belum login.' });
  res.json({ success: true, user: req.session.user });
});

// ---- User Management (admin only) ----

// GET /api/auth/users
router.get('/users', requireAdmin, (req, res) => {
  const users = readUsers().map(u => ({ ...u, password: undefined }));
  res.json({ success: true, data: users });
});

// POST /api/auth/users
router.post('/users', requireAdmin, async (req, res) => {
  const { username, password, name, role } = req.body;
  if (!username || !password || !name)
    return res.status(400).json({ success: false, message: 'Username, password, dan nama wajib diisi.' });

  const users = readUsers();
  if (users.find(u => u.username === username.toLowerCase()))
    return res.status(400).json({ success: false, message: 'Username sudah digunakan.' });

  const hashed = await bcrypt.hash(password, 10);
  const newUser = {
    id: Date.now(),
    username: username.toLowerCase().trim(),
    password: hashed,
    name: name.trim(),
    role: role || 'staff',
    createdAt: new Date().toISOString()
  };
  users.push(newUser);
  writeUsers(users);
  res.json({ success: true, message: 'User berhasil ditambahkan!', data: { ...newUser, password: undefined } });
});

// PUT /api/auth/users/:id
router.put('/users/:id', requireAdmin, async (req, res) => {
  const users = readUsers();
  const idx = users.findIndex(u => u.id == req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });

  const { name, role, password } = req.body;
  if (name) users[idx].name = name.trim();
  if (role) users[idx].role = role;
  if (password && password.trim()) {
    users[idx].password = await bcrypt.hash(password, 10);
  }
  users[idx].updatedAt = new Date().toISOString();
  writeUsers(users);
  res.json({ success: true, message: 'User diperbarui!', data: { ...users[idx], password: undefined } });
});

// DELETE /api/auth/users/:id
router.delete('/users/:id', requireAdmin, (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id == req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
  if (user.role === 'admin' && users.filter(u => u.role === 'admin').length <= 1)
    return res.status(400).json({ success: false, message: 'Tidak bisa menghapus admin terakhir.' });
  if (req.session.user.id === user.id)
    return res.status(400).json({ success: false, message: 'Tidak bisa menghapus diri sendiri.' });

  const filtered = users.filter(u => u.id != req.params.id);
  writeUsers(filtered);
  res.json({ success: true, message: 'User dihapus.' });
});

// Middleware
function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ success: false, message: 'Belum login.' });
  if (req.session.user.role !== 'admin')
    return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya admin.' });
  next();
}

module.exports = router;
