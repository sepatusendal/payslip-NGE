// =====================
// State
// =====================
let employees = [], payslips = [], settings = {}, currentUser = null;
let calcTimeout = null, currentEditId = null, currentEditUserId = null;
let importFile = null;

// =====================
// Init
// =====================
document.addEventListener('DOMContentLoaded', async () => {
  // Check auth first
  const authOk = await checkAuth();
  if (!authOk) return;

  await Promise.all([loadSettings(), loadEmployees(), loadPayslips()]);
  updateDashboard();
  populateEmployeeSelect();
  const now = new Date();
  document.getElementById('gen-month').value = now.getMonth() + 1;
  document.getElementById('gen-year').value = now.getFullYear();
  document.getElementById('filter-year').value = now.getFullYear();
  document.getElementById('exp-year').value = now.getFullYear();
});

async function checkAuth() {
  try {
    const r = await fetch('/api/auth/me');
    const data = await r.json();
    if (!data.success) { window.location.href = '/login'; return false; }
    currentUser = data.user;
    updateUserUI();
    applyRoleUI();
    return true;
  } catch { window.location.href = '/login'; return false; }
}

function updateUserUI() {
  if (!currentUser) return;
  document.getElementById('user-name').textContent = currentUser.name;
  document.getElementById('user-role').textContent = currentUser.role;
  document.getElementById('user-avatar').textContent = currentUser.name.charAt(0).toUpperCase();
}

function applyRoleUI() {
  if (!currentUser) return;
  if (currentUser.role !== 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }
}

async function doLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}

// =====================
// Navigation
// =====================
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => switchPage(btn.dataset.page));
});

function switchPage(page) {
  // Block non-admin from users page
  if (page === 'users' && currentUser?.role !== 'admin') { toast('Akses ditolak', 'error'); return; }
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const navBtn = document.querySelector(`[data-page="${page}"]`);
  if (navBtn) navBtn.classList.add('active');
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');

  if (page === 'history') loadHistory();
  if (page === 'employees') renderEmployees();
  if (page === 'settings') fillSettings();
  if (page === 'generate') populateEmployeeSelect();
  if (page === 'users') loadUsers();
}

// =====================
// API helpers
// =====================
async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  if (r.status === 401) { window.location.href = '/login'; return { success: false }; }
  return r.json();
}

async function apiForm(url, formData) {
  const r = await fetch(url, { method: 'POST', body: formData });
  if (r.status === 401) { window.location.href = '/login'; return { success: false }; }
  return r.json();
}

// =====================
// Data Loaders
// =====================
async function loadSettings() { const r = await api('GET', '/api/settings'); if (r.success) settings = r.data; }
async function loadEmployees() { const r = await api('GET', '/api/employees'); if (r.success) employees = r.data; }
async function loadPayslips()  { const r = await api('GET', '/api/payslip');   if (r.success) payslips = r.data; }

// =====================
// Dashboard
// =====================
function updateDashboard() {
  document.getElementById('stat-employees').textContent = employees.length;
  document.getElementById('stat-payslips').textContent = payslips.length;
  const now = new Date();
  const thisMonth = payslips.filter(p => p.month === now.getMonth() + 1 && p.year === now.getFullYear());
  document.getElementById('stat-this-month').textContent = thisMonth.length;
  const totalGaji = thisMonth.reduce((s, p) => s + (p.gajiBersih || 0), 0);
  document.getElementById('stat-total-gaji').textContent = 'Rp ' + fmt(totalGaji);

  const recent = payslips.slice(0, 5);
  const container = document.getElementById('recent-payslips');
  if (!recent.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📄</div><p>Belum ada slip gaji.</p></div>`;
    return;
  }
  container.innerHTML = `<table class="data-table"><thead><tr><th>Karyawan</th><th>Periode</th><th>Gaji Bersih</th><th>Dibuat</th><th>Aksi</th></tr></thead><tbody>
    ${recent.map(p => `<tr>
      <td><strong>${p.employee.name}</strong><br><span style="color:var(--text-muted);font-size:12px;">${p.employee.position||''}</span></td>
      <td><span class="badge badge-blue">${monthName(p.month)} ${p.year}</span></td>
      <td><strong>Rp ${fmt(p.gajiBersih)}</strong></td>
      <td style="color:var(--text-muted);font-size:12px;">${formatDate(p.generatedAt)}</td>
      <td><div class="action-btns">
        <button class="btn btn-sm btn-secondary" onclick="viewPayslip('${p.id}')">👁 Lihat</button>
        <button class="btn btn-sm btn-success" onclick="sendEmail('${p.id}')">✉</button>
      </div></td>
    </tr>`).join('')}
  </tbody></table>`;
}

// =====================
// Generate
// =====================
function populateEmployeeSelect() {
  const sel = document.getElementById('gen-employee');
  sel.innerHTML = '<option value="">-- Pilih Karyawan --</option>' +
    employees.map(e => `<option value="${e.id}">${e.name}${e.position ? ' — ' + e.position : ''}</option>`).join('');
}

function onEmployeeSelect() {
  const id = document.getElementById('gen-employee').value;
  if (!id) return;
  const emp = employees.find(e => e.id === id);
  if (!emp) return;
  ['gajiPokok','tunjanganTetap','uangMakan','uangTransport'].forEach(f => {
    if (emp[f]) document.getElementById('gen-' + f).value = emp[f];
  });
  if (emp.statusPajak) document.getElementById('gen-statusPajak').value = emp.statusPajak;
  document.getElementById('gen-hasNPWP').checked = emp.hasNPWP !== false;
  triggerCalculate();
}

function triggerCalculate() {
  clearTimeout(calcTimeout);
  calcTimeout = setTimeout(calculatePreview, 600);
}

async function calculatePreview() {
  const employeeId = document.getElementById('gen-employee').value;
  if (!employeeId) return;
  const r = await api('POST', '/api/payslip/calculate', { employeeId, overrides: getOverrides() });
  if (!r.success) return;
  const d = r.data;
  document.getElementById('calc-preview').innerHTML = `
    <h3 style="font-size:14px;font-weight:600;margin-bottom:16px;">📊 Preview Perhitungan</h3>
    <div class="calc-section"><div class="calc-title">💰 Pendapatan</div>
      <div class="calc-row"><span>Gaji Pokok</span><span>Rp ${fmt(d.gajiPokok)}</span></div>
      ${d.tunjanganTetap?`<div class="calc-row"><span>Tunjangan Tetap</span><span>Rp ${fmt(d.tunjanganTetap)}</span></div>`:''}
      ${d.uangMakan?`<div class="calc-row"><span>Uang Makan</span><span>Rp ${fmt(d.uangMakan)}</span></div>`:''}
      ${d.uangTransport?`<div class="calc-row"><span>Uang Transport</span><span>Rp ${fmt(d.uangTransport)}</span></div>`:''}
      ${d.uangLembur?`<div class="calc-row"><span>Lembur (${d.lemburJam} jam)</span><span>Rp ${fmt(d.uangLembur)}</span></div>`:''}
      ${d.bonus?`<div class="calc-row"><span>Bonus/THR</span><span>Rp ${fmt(d.bonus)}</span></div>`:''}
      <div class="calc-row total"><span>Total Bruto</span><span>Rp ${fmt(d.totalBruto)}</span></div>
    </div>
    <div class="calc-section"><div class="calc-title">✂️ Potongan</div>
      <div class="calc-row"><span>BPJS Kesehatan</span><span>Rp ${fmt(d.bpjs?.kesehatan?.employee)}</span></div>
      <div class="calc-row"><span>JHT + JP</span><span>Rp ${fmt((d.bpjs?.ketenagakerjaan?.jht?.employee||0)+(d.bpjs?.ketenagakerjaan?.jp?.employee||0))}</span></div>
      <div class="calc-row"><span>PPh 21 (${d.statusPajak})</span><span>Rp ${fmt(d.pph21?.pph21Monthly)}</span></div>
      ${d.kasbon?`<div class="calc-row"><span>Kasbon</span><span>Rp ${fmt(d.kasbon)}</span></div>`:''}
      ${d.potonganLain?`<div class="calc-row"><span>Potongan Lain</span><span>Rp ${fmt(d.potonganLain)}</span></div>`:''}
      <div class="calc-row total"><span>Total Potongan</span><span>Rp ${fmt(d.totalPotongan)}</span></div>
    </div>
    <div class="calc-section"><div class="calc-title">📋 PPh 21 Detail</div>
      <div class="calc-row"><span>PKP Dibulatkan</span><span>Rp ${fmt(d.pph21?.pkp)}</span></div>
      <div class="calc-row"><span>PTKP (${d.statusPajak})</span><span>Rp ${fmt(d.pph21?.ptkp)}</span></div>
      <div class="calc-row"><span>PPh 21 Setahun</span><span>Rp ${fmt(d.pph21?.pph21Annual)}</span></div>
    </div>
    <div class="calc-net"><div class="label">GAJI BERSIH</div><div class="amount">Rp ${fmt(d.gajiBersih)}</div></div>`;
}

function getOverrides() {
  return {
    gajiPokok: numVal('gen-gajiPokok'), tunjanganTetap: numVal('gen-tunjanganTetap'),
    uangMakan: numVal('gen-uangMakan'), uangTransport: numVal('gen-uangTransport'),
    bonus: numVal('gen-bonus'), tunjanganLain: numVal('gen-tunjanganLain'),
    lemburJam: numVal('gen-lemburJam'), kasbon: numVal('gen-kasbon'),
    potonganLain: numVal('gen-potonganLain'),
    statusPajak: document.getElementById('gen-statusPajak').value,
    hasNPWP: document.getElementById('gen-hasNPWP').checked
  };
}

async function generatePayslip() {
  const employeeId = document.getElementById('gen-employee').value;
  if (!employeeId) { toast('Pilih karyawan terlebih dahulu', 'error'); return; }
  const r = await api('POST', '/api/payslip/generate', {
    employeeId,
    month: document.getElementById('gen-month').value,
    year: document.getElementById('gen-year').value,
    notes: document.getElementById('gen-notes').value,
    overrides: getOverrides()
  });
  if (r.success) {
    payslips.unshift(r.data);
    toast('✅ Payslip berhasil dibuat!', 'success');
    updateDashboard();
    setTimeout(() => viewPayslip(r.data.id), 500);
  } else toast(r.message, 'error');
}

// =====================
// Employees
// =====================
function renderEmployees(filter = '') {
  const filtered = employees.filter(e =>
    !filter || e.name.toLowerCase().includes(filter) ||
    (e.position||'').toLowerCase().includes(filter) ||
    (e.department||'').toLowerCase().includes(filter)
  );
  const container = document.getElementById('employees-table');
  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><p>Belum ada karyawan.</p></div>`;
    return;
  }
  container.innerHTML = `<table class="data-table"><thead><tr>
    <th>Nama</th><th>Jabatan / Dept</th><th>Email</th><th>Gaji Pokok</th><th>Status Pajak</th><th>Aksi</th>
  </tr></thead><tbody>
    ${filtered.map(e => `<tr>
      <td><div style="display:flex;align-items:center;gap:10px;">
        <div style="width:32px;height:32px;background:${stringToColor(e.name)};border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:13px;flex-shrink:0;">${e.name.charAt(0).toUpperCase()}</div>
        <div><strong>${e.name}</strong><br><span style="color:var(--text-muted);font-size:12px;">${e.noKaryawan||''}</span></div>
      </div></td>
      <td>${e.position||'-'}<br><span style="color:var(--text-muted);font-size:12px;">${e.department||''}</span></td>
      <td style="color:var(--text-muted);">${e.email||'-'}</td>
      <td><strong>Rp ${fmt(e.gajiPokok)}</strong></td>
      <td><span class="badge badge-gray">${e.statusPajak||'TK0'}</span></td>
      <td><div class="action-btns">
        <button class="btn btn-sm btn-secondary" onclick="editEmployee('${e.id}')">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="deleteEmployee('${e.id}','${e.name.replace(/'/g,"\\'")}')">🗑</button>
      </div></td>
    </tr>`).join('')}
  </tbody></table>`;
}

function filterEmployees() { renderEmployees(document.getElementById('emp-search').value.toLowerCase()); }

function openEmployeeModal(id = null) {
  currentEditId = id;
  document.getElementById('emp-modal-title').textContent = id ? 'Edit Karyawan' : 'Tambah Karyawan';
  document.getElementById('emp-modal').style.display = 'flex';
  const fields = ['id','name','noKaryawan','nik','npwp','position','department','email','phone',
    'gajiPokok','tunjanganTetap','uangMakan','uangTransport','statusPajak','hasNPWP'];
  if (id) {
    const emp = employees.find(e => e.id === id);
    if (emp) fields.forEach(f => {
      const el = document.getElementById(`emp-${f}`);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = emp[f] !== false;
      else el.value = emp[f] || '';
    });
  } else {
    fields.forEach(f => {
      const el = document.getElementById(`emp-${f}`);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = true;
      else if (f === 'statusPajak') el.value = 'TK0';
      else el.value = '';
    });
  }
}

function closeEmployeeModal(event) {
  if (event && event.target !== document.getElementById('emp-modal')) return;
  document.getElementById('emp-modal').style.display = 'none';
}

async function saveEmployee() {
  const name = document.getElementById('emp-name').value.trim();
  if (!name) { toast('Nama karyawan wajib diisi', 'error'); return; }
  const payload = {
    name, noKaryawan: strVal('emp-noKaryawan'), nik: strVal('emp-nik'),
    npwp: strVal('emp-npwp'), position: strVal('emp-position'), department: strVal('emp-department'),
    email: strVal('emp-email'), phone: strVal('emp-phone'),
    gajiPokok: numVal('emp-gajiPokok'), tunjanganTetap: numVal('emp-tunjanganTetap'),
    uangMakan: numVal('emp-uangMakan'), uangTransport: numVal('emp-uangTransport'),
    statusPajak: strVal('emp-statusPajak'), hasNPWP: document.getElementById('emp-hasNPWP').checked
  };
  const r = currentEditId
    ? await api('PUT', `/api/employees/${currentEditId}`, payload)
    : await api('POST', '/api/employees', payload);
  if (r.success) {
    await loadEmployees(); renderEmployees(); populateEmployeeSelect(); updateDashboard();
    closeEmployeeModal(); toast(r.message, 'success');
  } else toast(r.message, 'error');
}

function editEmployee(id) { openEmployeeModal(id); }

async function deleteEmployee(id, name) {
  if (!confirm(`Hapus karyawan "${name}"?`)) return;
  const r = await api('DELETE', `/api/employees/${id}`);
  if (r.success) { await loadEmployees(); renderEmployees(); populateEmployeeSelect(); updateDashboard(); toast(r.message, 'success'); }
  else toast(r.message, 'error');
}

// =====================
// History
// =====================
async function loadHistory() {
  await loadPayslips();
  const filterMonth = parseInt(document.getElementById('filter-month').value) || null;
  const filterYear  = parseInt(document.getElementById('filter-year').value) || null;
  let filtered = payslips;
  if (filterMonth) filtered = filtered.filter(p => p.month === filterMonth);
  if (filterYear)  filtered = filtered.filter(p => p.year === filterYear);
  const container = document.getElementById('history-table');
  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📂</div><p>Tidak ada slip gaji di periode ini.</p></div>`;
    return;
  }
  container.innerHTML = `<table class="data-table"><thead><tr>
    <th>Karyawan</th><th>Jabatan</th><th>Periode</th><th>Total Bruto</th><th>Potongan</th><th>Gaji Bersih</th><th>Dibuat</th><th>Aksi</th>
  </tr></thead><tbody>
    ${filtered.map(p => `<tr>
      <td><strong>${p.employee.name}</strong></td>
      <td style="color:var(--text-muted);">${p.employee.position||'-'}</td>
      <td><span class="badge badge-blue">${monthName(p.month)} ${p.year}</span></td>
      <td>Rp ${fmt(p.totalBruto)}</td>
      <td style="color:var(--error);">-Rp ${fmt(p.totalPotongan)}</td>
      <td><strong style="color:var(--success);">Rp ${fmt(p.gajiBersih)}</strong></td>
      <td style="color:var(--text-muted);font-size:12px;">${formatDate(p.generatedAt)}</td>
      <td><div class="action-btns">
        <button class="btn btn-sm btn-secondary" onclick="viewPayslip('${p.id}')">👁</button>
        <button class="btn btn-sm btn-success" onclick="sendEmail('${p.id}')">✉</button>
        <button class="btn btn-sm btn-danger" onclick="deletePayslip('${p.id}')">🗑</button>
      </div></td>
    </tr>`).join('')}
  </tbody></table>`;
}

function viewPayslip(id) { window.open(`/api/payslip/${id}/html`, '_blank'); }

async function sendEmail(id) {
  const p = payslips.find(x => x.id === id);
  const email = p?.employee?.email;
  const toEmail = email
    ? (confirm(`Kirim slip gaji ke ${email}?`) ? email : prompt('Masukkan email tujuan:'))
    : prompt('Masukkan email tujuan:');
  if (!toEmail) return;
  toast('Mengirim email...', '');
  const r = await api('POST', `/api/email/send/${id}`, { email: toEmail });
  toast(r.message, r.success ? 'success' : 'error');
}

async function deletePayslip(id) {
  if (!confirm('Hapus slip gaji ini?')) return;
  const r = await api('DELETE', `/api/payslip/${id}`);
  if (r.success) { await loadPayslips(); loadHistory(); updateDashboard(); toast(r.message, 'success'); }
}

// =====================
// Export / Import
// =====================
function exportPayroll(format) {
  const month = document.getElementById('exp-month').value;
  const year  = document.getElementById('exp-year').value;
  const params = new URLSearchParams();
  if (month) params.set('month', month);
  if (year)  params.set('year', year);
  window.open(`/api/export/payroll/${format}?${params}`, '_blank');
}

function exportEmployees() {
  window.open('/api/export/employees/csv', '_blank');
}

function downloadTemplate() {
  const header = 'Nama,No Karyawan,NIK KTP,NPWP,Jabatan,Departemen,Email,No HP,Status Pajak,Memiliki NPWP,Gaji Pokok,Tunjangan Tetap,Uang Makan,Uang Transport\n';
  const sample = 'Budi Santoso,KRY-001,3201234567890001,,Staff IT,IT,budi@email.com,081234567890,TK0,Ya,5000000,500000,600000,300000\n';
  const blob = new Blob(['\uFEFF' + header + sample], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'Template_Import_Karyawan.csv'; a.click();
  URL.revokeObjectURL(url);
}

function handleFileSelect() {
  const file = document.getElementById('csv-file').files[0];
  setImportFile(file);
}

function handleDrop(event) {
  event.preventDefault();
  document.getElementById('import-zone').classList.remove('drag-over');
  const file = event.dataTransfer.files[0];
  if (file && file.name.endsWith('.csv')) {
    setImportFile(file);
  } else toast('Hanya file CSV yang didukung', 'error');
}

function setImportFile(file) {
  if (!file) return;
  importFile = file;
  document.getElementById('selected-file-name').textContent = `📄 ${file.name} (${(file.size/1024).toFixed(1)} KB)`;
  document.getElementById('import-zone').classList.add('has-file');
  document.getElementById('btn-import').disabled = false;
}

async function doImport() {
  if (!importFile) { toast('Pilih file CSV terlebih dahulu', 'error'); return; }
  const btn = document.getElementById('btn-import');
  btn.disabled = true; btn.textContent = '⏳ Memproses...';
  const form = new FormData();
  form.append('file', importFile);
  try {
    const r = await apiForm('/api/export/employees/import', form);
    const resultEl = document.getElementById('import-result');
    if (r.success) {
      await loadEmployees(); renderEmployees(); populateEmployeeSelect(); updateDashboard();
      resultEl.innerHTML = `<div class="import-success">✅ ${r.message}
        ${r.errors?.length ? `<ul class="import-warn-list">${r.errors.map(e=>`<li>${e}</li>`).join('')}</ul>` : ''}
      </div>`;
      toast(r.message, 'success');
    } else {
      resultEl.innerHTML = `<div class="import-error">❌ ${r.message}</div>`;
      toast(r.message, 'error');
    }
  } catch { toast('Gagal upload file', 'error'); }
  btn.disabled = false; btn.textContent = '⬆️ Import Sekarang';
}

// =====================
// User Management
// =====================
async function loadUsers() {
  const r = await api('GET', '/api/auth/users');
  const container = document.getElementById('users-table');
  if (!r.success) { container.innerHTML = `<div class="empty-state"><p>${r.message}</p></div>`; return; }
  const users = r.data;
  if (!users.length) { container.innerHTML = `<div class="empty-state"><div class="empty-icon">🔐</div><p>Belum ada user.</p></div>`; return; }
  container.innerHTML = `<table class="data-table"><thead><tr>
    <th>Nama</th><th>Username</th><th>Role</th><th>Dibuat</th><th>Aksi</th>
  </tr></thead><tbody>
    ${users.map(u => `<tr>
      <td><div style="display:flex;align-items:center;gap:10px;">
        <div style="width:32px;height:32px;background:${u.role==='admin'?'#2563eb':'#6b7280'};border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:13px;">${u.name.charAt(0).toUpperCase()}</div>
        <strong>${u.name}</strong>${u.id == currentUser?.id ? ' <span class="badge badge-blue" style="font-size:10px;">Anda</span>' : ''}
      </div></td>
      <td style="font-family:monospace;font-size:13px;">${u.username}</td>
      <td><span class="badge ${u.role==='admin'?'role-badge-admin':'role-badge-staff'}">${u.role}</span></td>
      <td style="color:var(--text-muted);font-size:12px;">${formatDate(u.createdAt)}</td>
      <td><div class="action-btns">
        <button class="btn btn-sm btn-secondary" onclick="editUser(${u.id},'${u.name.replace(/'/g,"\\'")}','${u.role}')">✏️ Edit</button>
        ${u.id != currentUser?.id ? `<button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id},'${u.name.replace(/'/g,"\\'")}')">🗑</button>` : ''}
      </div></td>
    </tr>`).join('')}
  </tbody></table>`;
}

function openUserModal() {
  currentEditUserId = null;
  document.getElementById('user-modal-title').textContent = 'Tambah User';
  document.getElementById('u-pass-hint').textContent = '*';
  ['u-id','u-name','u-username','u-password'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('u-role').value = 'staff';
  document.getElementById('u-username').disabled = false;
  document.getElementById('user-modal').style.display = 'flex';
}

function editUser(id, name, role) {
  currentEditUserId = id;
  document.getElementById('user-modal-title').textContent = 'Edit User';
  document.getElementById('u-pass-hint').textContent = '(kosongkan jika tidak diubah)';
  document.getElementById('u-id').value = id;
  document.getElementById('u-name').value = name;
  document.getElementById('u-username').disabled = true;
  document.getElementById('u-password').value = '';
  document.getElementById('u-role').value = role;
  document.getElementById('user-modal').style.display = 'flex';
}

function closeUserModal(event) {
  if (event && event.target !== document.getElementById('user-modal')) return;
  document.getElementById('user-modal').style.display = 'none';
}

async function saveUser() {
  const name = document.getElementById('u-name').value.trim();
  const password = document.getElementById('u-password').value;
  const role = document.getElementById('u-role').value;
  if (!name) { toast('Nama wajib diisi', 'error'); return; }
  let r;
  if (currentEditUserId) {
    r = await api('PUT', `/api/auth/users/${currentEditUserId}`, { name, role, password });
  } else {
    const username = document.getElementById('u-username').value.trim();
    if (!username || !password) { toast('Username dan password wajib diisi', 'error'); return; }
    if (password.length < 6) { toast('Password minimal 6 karakter', 'error'); return; }
    r = await api('POST', '/api/auth/users', { username, password, name, role });
  }
  if (r.success) { loadUsers(); closeUserModal(); toast(r.message, 'success'); }
  else toast(r.message, 'error');
}

async function deleteUser(id, name) {
  if (!confirm(`Hapus user "${name}"?`)) return;
  const r = await api('DELETE', `/api/auth/users/${id}`);
  if (r.success) { loadUsers(); toast(r.message, 'success'); }
  else toast(r.message, 'error');
}

// =====================
// Settings
// =====================
function fillSettings() {
  if (!settings) return;
  const s = settings;
  setValue('s-companyName', s.companyName); setValue('s-companyAddress', s.companyAddress);
  setValue('s-companyPhone', s.companyPhone); setValue('s-companyEmail', s.companyEmail);
  setValue('s-companyNPWP', s.companyNPWP); setValue('s-smtpHost', s.smtp?.host);
  setValue('s-smtpPort', s.smtp?.port); setValue('s-smtpUser', s.smtp?.user);
  setValue('s-smtpPass', s.smtp?.pass); setValue('s-smtpFrom', s.smtp?.from);
  setValue('s-pph21Method', s.pph21Method);
  setValue('s-bpjsKesehatanEmployee', s.bpjsKesehatan?.employee);
  setValue('s-bpjsKesehatanEmployer', s.bpjsKesehatan?.employer);
  setValue('s-jhtEmployee', s.bpjsKetenagakerjaan?.jht_employee);
  setValue('s-jhtEmployer', s.bpjsKetenagakerjaan?.jht_employer);
  setValue('s-jpEmployee', s.bpjsKetenagakerjaan?.jp_employee);
  setValue('s-jpEmployer', s.bpjsKetenagakerjaan?.jp_employer);
  setValue('s-jkk', s.bpjsKetenagakerjaan?.jkk);
  setValue('s-jkm', s.bpjsKetenagakerjaan?.jkm);
  if (s.logo) {
    const img = document.getElementById('logo-preview');
    img.src = s.logo; img.style.display = 'block';
    document.getElementById('logo-placeholder').style.display = 'none';
  }
}

async function saveSettings() {
  const formData = new FormData();
  [['companyName','s-companyName'],['companyAddress','s-companyAddress'],['companyPhone','s-companyPhone'],
   ['companyEmail','s-companyEmail'],['companyNPWP','s-companyNPWP'],['smtpHost','s-smtpHost'],
   ['smtpPort','s-smtpPort'],['smtpUser','s-smtpUser'],['smtpPass','s-smtpPass'],['smtpFrom','s-smtpFrom'],
   ['pph21Method','s-pph21Method'],['bpjsKesehatanEmployee','s-bpjsKesehatanEmployee'],
   ['bpjsKesehatanEmployer','s-bpjsKesehatanEmployer'],['jhtEmployee','s-jhtEmployee'],
   ['jhtEmployer','s-jhtEmployer'],['jpEmployee','s-jpEmployee'],['jpEmployer','s-jpEmployer'],
   ['jkk','s-jkk'],['jkm','s-jkm']
  ].forEach(([key, id]) => { const val = document.getElementById(id)?.value; if (val !== undefined) formData.append(key, val); });
  const logoFile = document.getElementById('logo-file').files[0];
  if (logoFile) formData.append('logo', logoFile);
  const r = await apiForm('/api/settings', formData);
  if (r.success) { settings = r.data; toast('✅ Settings tersimpan!', 'success'); }
  else toast(r.message, 'error');
}

async function testSMTP() {
  const el = document.getElementById('smtp-test-result');
  el.innerHTML = '<span style="color:var(--text-muted)">🔄 Menghubungkan...</span>';
  const r = await api('POST', '/api/email/test');
  el.innerHTML = r.success
    ? `<span style="color:var(--success);font-size:13px;">✅ ${r.message}</span>`
    : `<span style="color:var(--error);font-size:13px;">❌ ${r.message}</span>`;
}

function previewLogo() {
  const file = document.getElementById('logo-file').files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById('logo-preview');
    img.src = e.target.result; img.style.display = 'block';
    document.getElementById('logo-placeholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function togglePassword(id) {
  const el = document.getElementById(id);
  el.type = el.type === 'password' ? 'text' : 'password';
}

// =====================
// Utils
// =====================
const fmt = (n) => new Intl.NumberFormat('id-ID').format(Math.round(n || 0));
const numVal = (id) => parseFloat(document.getElementById(id)?.value) || 0;
const strVal = (id) => document.getElementById(id)?.value || '';
const setValue = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; };
const MONTH_NAMES = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const monthName = (m) => m ? MONTH_NAMES[m - 1] : '-';
const formatDate = (iso) => iso ? new Date(iso).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }) : '-';

function stringToColor(str) {
  const colors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16'];
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

function toast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast show ${type}`;
  setTimeout(() => t.classList.remove('show'), 3500);
}
