const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const { v4: uuidv4 } = require('uuid');

const dataDir = path.join(__dirname, '..', 'data');
const payslipsFile  = path.join(dataDir, 'payslips.json');
const employeesFile = path.join(dataDir, 'employees.json');

const readJSON = (f) => JSON.parse(fs.readFileSync(f));
const writeJSON = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

const monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const fmt = (n) => Math.round(n || 0);

// ─── EXPORT PAYROLL CSV ──────────────────────────────────────
// GET /api/export/payroll/csv?month=1&year=2025
router.get('/payroll/csv', (req, res) => {
  const { month, year } = req.query;
  let payslips = readJSON(payslipsFile);
  if (month) payslips = payslips.filter(p => p.month == month);
  if (year)  payslips = payslips.filter(p => p.year == year);

  if (!payslips.length) return res.status(404).json({ success: false, message: 'Tidak ada data.' });

  const rows = payslips.map(p => ({
    'No': '',
    'Nama Karyawan': p.employee.name,
    'No Karyawan': p.employee.noKaryawan || '',
    'Jabatan': p.employee.position || '',
    'Departemen': p.employee.department || '',
    'Periode': `${monthNames[(p.month||1)-1]} ${p.year}`,
    'Status Pajak': p.statusPajak || '',
    'Gaji Pokok': fmt(p.gajiPokok),
    'Tunjangan Tetap': fmt(p.tunjanganTetap),
    'Uang Makan': fmt(p.uangMakan),
    'Uang Transport': fmt(p.uangTransport),
    'Tunjangan Lain': fmt(p.tunjanganLain),
    'Uang Lembur': fmt(p.uangLembur),
    'Bonus/THR': fmt(p.bonus),
    'Total Bruto': fmt(p.totalBruto),
    'BPJS Kesehatan (Karyawan)': fmt(p.bpjs?.kesehatan?.employee),
    'BPJS JHT (Karyawan)': fmt(p.bpjs?.ketenagakerjaan?.jht?.employee),
    'BPJS JP (Karyawan)': fmt(p.bpjs?.ketenagakerjaan?.jp?.employee),
    'PPh 21': fmt(p.pph21?.pph21Monthly),
    'Kasbon': fmt(p.kasbon),
    'Potongan Lain': fmt(p.potonganLain),
    'Total Potongan': fmt(p.totalPotongan),
    'Gaji Bersih': fmt(p.gajiBersih),
    'BPJS Kesehatan (Perusahaan)': fmt(p.bpjs?.kesehatan?.employer),
    'BPJS JHT (Perusahaan)': fmt(p.bpjs?.ketenagakerjaan?.jht?.employer),
    'BPJS JP (Perusahaan)': fmt(p.bpjs?.ketenagakerjaan?.jp?.employer),
    'JKK': fmt(p.bpjs?.ketenagakerjaan?.jkk?.employer),
    'JKM': fmt(p.bpjs?.ketenagakerjaan?.jkm?.employer),
    'Total Beban Perusahaan': fmt(p.employerCost),
    'Tanggal Generate': new Date(p.generatedAt).toLocaleDateString('id-ID'),
    'Catatan': p.notes || ''
  }));

  // Add row numbers
  rows.forEach((r, i) => r['No'] = i + 1);

  const csv = stringify(rows, { header: true, quoted: true });
  const periodLabel = month ? `${monthNames[(parseInt(month))-1]}_${year}` : `semua_${year || 'periode'}`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="Payroll_${periodLabel}.csv"`);
  res.send('\uFEFF' + csv); // BOM for Excel UTF-8
});

// ─── EXPORT PAYROLL JSON ─────────────────────────────────────
// GET /api/export/payroll/json?month=1&year=2025
router.get('/payroll/json', (req, res) => {
  const { month, year } = req.query;
  let payslips = readJSON(payslipsFile);
  if (month) payslips = payslips.filter(p => p.month == month);
  if (year)  payslips = payslips.filter(p => p.year == year);

  const periodLabel = month ? `${monthNames[(parseInt(month))-1]}_${year}` : 'all';
  res.setHeader('Content-Disposition', `attachment; filename="Payroll_${periodLabel}.json"`);
  res.json({ exportedAt: new Date().toISOString(), count: payslips.length, data: payslips });
});

// ─── EXPORT KARYAWAN CSV ─────────────────────────────────────
// GET /api/export/employees/csv
router.get('/employees/csv', (req, res) => {
  const employees = readJSON(employeesFile);
  if (!employees.length) return res.status(404).json({ success: false, message: 'Tidak ada karyawan.' });

  const rows = employees.map((e, i) => ({
    'No': i + 1,
    'Nama': e.name,
    'No Karyawan': e.noKaryawan || '',
    'NIK KTP': e.nik || '',
    'NPWP': e.npwp || '',
    'Jabatan': e.position || '',
    'Departemen': e.department || '',
    'Email': e.email || '',
    'No HP': e.phone || '',
    'Status Pajak': e.statusPajak || 'TK0',
    'Memiliki NPWP': e.hasNPWP !== false ? 'Ya' : 'Tidak',
    'Gaji Pokok': e.gajiPokok || 0,
    'Tunjangan Tetap': e.tunjanganTetap || 0,
    'Uang Makan': e.uangMakan || 0,
    'Uang Transport': e.uangTransport || 0
  }));

  const csv = stringify(rows, { header: true, quoted: true });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="Data_Karyawan.csv"');
  res.send('\uFEFF' + csv);
});

// ─── IMPORT KARYAWAN CSV ─────────────────────────────────────
// POST /api/export/employees/import  (multipart: file=csv)
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.post('/employees/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'File CSV tidak ditemukan.' });

  let rows;
  try {
    const content = req.file.buffer.toString('utf-8').replace(/^\uFEFF/, ''); // strip BOM
    rows = parse(content, { columns: true, skip_empty_lines: true, trim: true });
  } catch (e) {
    return res.status(400).json({ success: false, message: 'Format CSV tidak valid: ' + e.message });
  }

  if (!rows.length) return res.status(400).json({ success: false, message: 'File CSV kosong.' });

  const employees = readJSON(employeesFile);
  let added = 0, skipped = 0;
  const errors = [];

  rows.forEach((row, idx) => {
    const name = row['Nama'] || row['nama'] || row['name'] || '';
    if (!name.trim()) { skipped++; return; }

    // Check duplicate by name + noKaryawan
    const noKaryawan = row['No Karyawan'] || row['no_karyawan'] || '';
    const exists = employees.find(e =>
      e.name.toLowerCase() === name.toLowerCase() ||
      (noKaryawan && e.noKaryawan === noKaryawan)
    );

    if (exists) {
      skipped++;
      errors.push(`Baris ${idx + 2}: "${name}" sudah ada, dilewati.`);
      return;
    }

    const newEmp = {
      id: uuidv4(),
      name: name.trim(),
      noKaryawan: noKaryawan || '',
      nik: row['NIK KTP'] || row['nik'] || '',
      npwp: row['NPWP'] || row['npwp'] || '',
      position: row['Jabatan'] || row['jabatan'] || row['position'] || '',
      department: row['Departemen'] || row['departemen'] || row['department'] || '',
      email: row['Email'] || row['email'] || '',
      phone: row['No HP'] || row['phone'] || '',
      statusPajak: row['Status Pajak'] || row['status_pajak'] || 'TK0',
      hasNPWP: (row['Memiliki NPWP'] || '').toLowerCase() !== 'tidak',
      gajiPokok: parseNum(row['Gaji Pokok'] || row['gaji_pokok']),
      tunjanganTetap: parseNum(row['Tunjangan Tetap'] || row['tunjangan_tetap']),
      uangMakan: parseNum(row['Uang Makan'] || row['uang_makan']),
      uangTransport: parseNum(row['Uang Transport'] || row['uang_transport']),
      createdAt: new Date().toISOString(),
      importedFrom: 'csv'
    };

    employees.push(newEmp);
    added++;
  });

  writeJSON(employeesFile, employees);
  res.json({
    success: true,
    message: `Import selesai: ${added} karyawan ditambahkan, ${skipped} dilewati.`,
    added, skipped, errors
  });
});

// ─── EXPORT PAYROLL HTML (rekapitulasi) ──────────────────────
// GET /api/export/payroll/recap?month=1&year=2025
router.get('/payroll/recap', (req, res) => {
  const { month, year } = req.query;
  let payslips = readJSON(payslipsFile);
  if (month) payslips = payslips.filter(p => p.month == month);
  if (year)  payslips = payslips.filter(p => p.year == year);
  if (!payslips.length) return res.status(404).send('<h3>Tidak ada data payroll.</h3>');

  const periodLabel = month ? `${monthNames[(parseInt(month))-1]} ${year}` : `Semua Periode`;
  const totalBruto    = payslips.reduce((s,p) => s + (p.totalBruto||0), 0);
  const totalPotongan = payslips.reduce((s,p) => s + (p.totalPotongan||0), 0);
  const totalBersih   = payslips.reduce((s,p) => s + (p.gajiBersih||0), 0);
  const totalPPh21    = payslips.reduce((s,p) => s + (p.pph21?.pph21Monthly||0), 0);
  const totalBPJS     = payslips.reduce((s,p) => s + (p.bpjs?.totalEmployeeDeduction||0), 0);
  const company = payslips[0]?.company || {};

  const fmtRp = (n) => 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n||0));

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html><html lang="id"><head>
<meta charset="UTF-8"><title>Rekapitulasi Payroll ${periodLabel}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#1a1a2e;background:#fff}
.wrap{max-width:960px;margin:0 auto;padding:28px}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #2563eb;padding-bottom:16px;margin-bottom:20px}
.hdr h1{font-size:20px;font-weight:700;color:#2563eb}
.hdr p{font-size:11px;color:#6b7280;margin-top:3px}
.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
.sum-box{background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:14px;text-align:center}
.sum-box .val{font-size:16px;font-weight:700;color:#1d4ed8}
.sum-box .lbl{font-size:10px;color:#9ca3af;margin-top:3px;text-transform:uppercase;letter-spacing:.5px}
table{width:100%;border-collapse:collapse;font-size:11.5px}
th{background:#1d4ed8;color:white;padding:8px 6px;text-align:left;font-weight:600;font-size:10.5px}
td{padding:7px 6px;border-bottom:1px solid #f3f4f6}
tr:nth-child(even) td{background:#f9fafb}
.total-row td{font-weight:700;background:#eff6ff!important;font-size:12px;border-top:2px solid #bfdbfe}
.text-right{text-align:right}.text-center{text-align:center}
.footer{margin-top:20px;text-align:center;font-size:10px;color:#d1d5db;text-transform:uppercase;letter-spacing:1px}
@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body><div class="wrap">
<div class="hdr">
  <div>
    <h1>Rekapitulasi Payroll</h1>
    <p>${company.name || ''} &nbsp;|&nbsp; Periode: ${periodLabel}</p>
    <p>Digenerate: ${new Date().toLocaleDateString('id-ID',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
  </div>
  <div style="text-align:right">
    <div style="font-size:11px;color:#6b7280">${company.address||''}</div>
    <div style="font-size:11px;color:#6b7280">${company.phone||''}</div>
  </div>
</div>
<div class="summary">
  <div class="sum-box"><div class="val">${payslips.length}</div><div class="lbl">Jumlah Karyawan</div></div>
  <div class="sum-box"><div class="val">${fmtRp(totalBruto)}</div><div class="lbl">Total Bruto</div></div>
  <div class="sum-box"><div class="val">${fmtRp(totalPotongan)}</div><div class="lbl">Total Potongan</div></div>
  <div class="sum-box"><div class="val" style="color:#10b981">${fmtRp(totalBersih)}</div><div class="lbl">Total Gaji Bersih</div></div>
</div>
<table>
<thead><tr>
  <th>No</th><th>Nama Karyawan</th><th>Jabatan</th><th>Dept</th>
  <th class="text-right">Gaji Pokok</th><th class="text-right">Tunjangan</th><th class="text-right">Total Bruto</th>
  <th class="text-right">BPJS</th><th class="text-right">PPh 21</th><th class="text-right">Pot. Lain</th>
  <th class="text-right">Gaji Bersih</th>
</tr></thead>
<tbody>
${payslips.map((p,i) => `<tr>
  <td class="text-center">${i+1}</td>
  <td>${p.employee.name}</td>
  <td>${p.employee.position||'-'}</td>
  <td>${p.employee.department||'-'}</td>
  <td class="text-right">${fmtRp(p.gajiPokok)}</td>
  <td class="text-right">${fmtRp(p.totalTunjangan)}</td>
  <td class="text-right">${fmtRp(p.totalBruto)}</td>
  <td class="text-right">${fmtRp(p.bpjs?.totalEmployeeDeduction)}</td>
  <td class="text-right">${fmtRp(p.pph21?.pph21Monthly)}</td>
  <td class="text-right">${fmtRp((p.kasbon||0)+(p.potonganLain||0))}</td>
  <td class="text-right" style="font-weight:700;color:#1d4ed8">${fmtRp(p.gajiBersih)}</td>
</tr>`).join('')}
<tr class="total-row">
  <td colspan="4" style="font-weight:700">TOTAL</td>
  <td class="text-right">${fmtRp(payslips.reduce((s,p)=>s+(p.gajiPokok||0),0))}</td>
  <td class="text-right">${fmtRp(payslips.reduce((s,p)=>s+(p.totalTunjangan||0),0))}</td>
  <td class="text-right">${fmtRp(totalBruto)}</td>
  <td class="text-right">${fmtRp(totalBPJS)}</td>
  <td class="text-right">${fmtRp(totalPPh21)}</td>
  <td class="text-right">${fmtRp(payslips.reduce((s,p)=>s+(p.kasbon||0)+(p.potonganLain||0),0))}</td>
  <td class="text-right" style="color:#10b981">${fmtRp(totalBersih)}</td>
</tr>
</tbody></table>
<div class="footer">KONFIDENSIAL — ${company.name} — ${periodLabel}</div>
</div>
<script>window.onload=()=>window.print()</script>
</body></html>`);
});

function parseNum(v) { return parseFloat(String(v||'').replace(/[^0-9.-]/g,'')) || 0; }

module.exports = router;
