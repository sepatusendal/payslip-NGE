const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { calculatePayroll } = require('../utils/calculator');

const dataDir = path.join(__dirname, '..', 'data');
const employeesFile = path.join(dataDir, 'employees.json');
const payslipsFile  = path.join(dataDir, 'payslips.json');
const settingsFile  = path.join(dataDir, 'settings.json');

const readJSON = (f) => JSON.parse(fs.readFileSync(f));
const writeJSON = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

// Calculate preview (no save)
router.post('/calculate', (req, res) => {
  try {
    const settings = readJSON(settingsFile);
    const { employeeId, period, overrides = {} } = req.body;
    const employees = readJSON(employeesFile);
    const employee = employees.find(e => e.id === employeeId);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    const result = calculatePayroll(employee, overrides, settings);
    res.json({ success: true, data: result, employee, settings });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Generate & save payslip
router.post('/generate', (req, res) => {
  try {
    const settings = readJSON(settingsFile);
    const { employeeId, period, month, year, overrides = {}, notes = '' } = req.body;
    const employees = readJSON(employeesFile);
    const employee = employees.find(e => e.id === employeeId);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    const calc = calculatePayroll(employee, overrides, settings);

    const payslip = {
      id: uuidv4(),
      employeeId,
      employee: {
        name: employee.name,
        nik: employee.nik,
        position: employee.position,
        department: employee.department,
        email: employee.email,
        npwp: employee.npwp,
        noKaryawan: employee.noKaryawan
      },
      period: period || `${month}/${year}`,
      month: parseInt(month),
      year: parseInt(year),
      generatedAt: new Date().toISOString(),
      notes,
      ...calc,
      company: {
        name: settings.companyName,
        address: settings.companyAddress,
        phone: settings.companyPhone,
        email: settings.companyEmail,
        npwp: settings.companyNPWP,
        logo: settings.logo
      }
    };

    const payslips = readJSON(payslipsFile);
    payslips.unshift(payslip);
    writeJSON(payslipsFile, payslips);

    res.json({ success: true, data: payslip, message: 'Payslip generated!' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Get all payslips
router.get('/', (req, res) => {
  try {
    const payslips = readJSON(payslipsFile);
    res.json({ success: true, data: payslips });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Get single payslip
router.get('/:id', (req, res) => {
  try {
    const payslips = readJSON(payslipsFile);
    const p = payslips.find(x => x.id === req.params.id);
    if (!p) return res.status(404).json({ success: false, message: 'Payslip not found' });
    res.json({ success: true, data: p });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Delete payslip
router.delete('/:id', (req, res) => {
  try {
    const payslips = readJSON(payslipsFile).filter(x => x.id !== req.params.id);
    writeJSON(payslipsFile, payslips);
    res.json({ success: true, message: 'Payslip deleted!' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Render payslip HTML (for print/PDF)
router.get('/:id/html', (req, res) => {
  try {
    const payslips = readJSON(payslipsFile);
    const p = payslips.find(x => x.id === req.params.id);
    if (!p) return res.status(404).json({ success: false, message: 'Not found' });
    const html = generatePayslipHTML(p);
    res.send(html);
  } catch (e) {
    res.status(500).send(e.message);
  }
});

function generatePayslipHTML(p) {
  const fmt = (n) => new Intl.NumberFormat('id-ID').format(Math.round(n || 0));
  const monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const periodLabel = p.month ? `${monthNames[p.month - 1]} ${p.year}` : p.period;

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Slip Gaji - ${p.employee.name} - ${periodLabel}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a1a2e; background: #fff; }
  .payslip { max-width: 800px; margin: 0 auto; padding: 32px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 2px solid #e8e8e8; }
  .company-logo { width: 64px; height: 64px; object-fit: contain; }
  .company-logo-placeholder { width: 64px; height: 64px; background: #2563eb; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 20px; }
  .company-info h1 { font-size: 18px; font-weight: 700; color: #1a1a2e; }
  .company-info p { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .payslip-title { text-align: right; }
  .payslip-title h2 { font-size: 20px; font-weight: 700; color: #2563eb; letter-spacing: 2px; text-transform: uppercase; }
  .payslip-title p { font-size: 11px; color: #6b7280; }
  .employee-section { background: #f8fafc; border-radius: 10px; padding: 16px; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .info-row { display: flex; flex-direction: column; gap: 2px; }
  .info-label { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
  .info-value { font-size: 13px; color: #111827; font-weight: 500; }
  .section-title { font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; margin-top: 16px; }
  table { width: 100%; border-collapse: collapse; }
  tr:not(:last-child) td { border-bottom: 1px solid #f3f4f6; }
  td { padding: 7px 4px; font-size: 12px; }
  td:last-child { text-align: right; font-weight: 500; }
  .total-row td { font-weight: 700; font-size: 13px; padding: 10px 4px; border-top: 2px solid #e5e7eb !important; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 16px; }
  .net-box { background: #2563eb; color: white; border-radius: 12px; padding: 20px; text-align: center; margin-top: 16px; }
  .net-box .label { font-size: 11px; opacity: 0.8; text-transform: uppercase; letter-spacing: 1px; }
  .net-box .amount { font-size: 28px; font-weight: 700; margin-top: 4px; }
  .footer { margin-top: 32px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
  .sign-box { text-align: center; }
  .sign-box .sign-line { border-top: 1px solid #9ca3af; margin-top: 60px; padding-top: 8px; font-size: 12px; color: #374151; }
  .sign-box .sign-label { font-size: 10px; color: #9ca3af; margin-top: 2px; }
  .notes-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px; margin-top: 16px; font-size: 11px; color: #92400e; }
  .confidential { text-align: center; margin-top: 24px; font-size: 10px; color: #d1d5db; text-transform: uppercase; letter-spacing: 2px; }
  @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } .payslip { padding: 20px; } }
</style>
</head>
<body>
<div class="payslip">
  <div class="header">
    <div style="display:flex;align-items:center;gap:14px;">
      ${p.company.logo
        ? `<img src="${p.company.logo}" class="company-logo" alt="Logo">`
        : `<div class="company-logo-placeholder">${(p.company.name || 'P').charAt(0)}</div>`}
      <div class="company-info">
        <h1>${p.company.name}</h1>
        <p>${p.company.address}</p>
        <p>📞 ${p.company.phone} &nbsp;|&nbsp; ✉ ${p.company.email}</p>
        ${p.company.npwp ? `<p>NPWP: ${p.company.npwp}</p>` : ''}
      </div>
    </div>
    <div class="payslip-title">
      <h2>Slip Gaji</h2>
      <p style="font-size:14px;font-weight:600;color:#374151;margin-top:4px;">${periodLabel}</p>
      <p>No: SG-${p.id.substring(0,8).toUpperCase()}</p>
    </div>
  </div>

  <div class="employee-section">
    <div class="info-row"><span class="info-label">Nama Karyawan</span><span class="info-value">${p.employee.name}</span></div>
    <div class="info-row"><span class="info-label">No. Karyawan</span><span class="info-value">${p.employee.noKaryawan || '-'}</span></div>
    <div class="info-row"><span class="info-label">Jabatan</span><span class="info-value">${p.employee.position || '-'}</span></div>
    <div class="info-row"><span class="info-label">Departemen</span><span class="info-value">${p.employee.department || '-'}</span></div>
    <div class="info-row"><span class="info-label">NIK</span><span class="info-value">${p.employee.nik || '-'}</span></div>
    <div class="info-row"><span class="info-label">NPWP / Status Pajak</span><span class="info-value">${p.employee.npwp || '-'} / ${p.statusPajak || 'TK0'}</span></div>
  </div>

  <div class="two-col">
    <div>
      <div class="section-title">💰 Pendapatan</div>
      <table>
        <tr><td>Gaji Pokok</td><td>Rp ${fmt(p.gajiPokok)}</td></tr>
        ${p.tunjanganTetap ? `<tr><td>Tunjangan Tetap</td><td>Rp ${fmt(p.tunjanganTetap)}</td></tr>` : ''}
        ${p.uangMakan ? `<tr><td>Uang Makan</td><td>Rp ${fmt(p.uangMakan)}</td></tr>` : ''}
        ${p.uangTransport ? `<tr><td>Uang Transport</td><td>Rp ${fmt(p.uangTransport)}</td></tr>` : ''}
        ${p.tunjanganLain ? `<tr><td>Tunjangan Lain-lain</td><td>Rp ${fmt(p.tunjanganLain)}</td></tr>` : ''}
        ${p.uangLembur ? `<tr><td>Uang Lembur (${p.lemburJam} jam)</td><td>Rp ${fmt(p.uangLembur)}</td></tr>` : ''}
        ${p.bonus ? `<tr><td>Bonus / THR</td><td>Rp ${fmt(p.bonus)}</td></tr>` : ''}
        <tr class="total-row"><td>Total Pendapatan Bruto</td><td>Rp ${fmt(p.totalBruto)}</td></tr>
      </table>
    </div>
    <div>
      <div class="section-title">✂️ Potongan</div>
      <table>
        <tr><td>BPJS Kesehatan (${p.bpjs?.kesehatan?.employee ? '1%' : ''})</td><td>Rp ${fmt(p.bpjs?.kesehatan?.employee)}</td></tr>
        <tr><td>BPJS JHT (2%)</td><td>Rp ${fmt(p.bpjs?.ketenagakerjaan?.jht?.employee)}</td></tr>
        <tr><td>BPJS JP (1%)</td><td>Rp ${fmt(p.bpjs?.ketenagakerjaan?.jp?.employee)}</td></tr>
        <tr><td>PPh 21</td><td>Rp ${fmt(p.pph21?.pph21Monthly)}</td></tr>
        ${p.kasbon ? `<tr><td>Kasbon</td><td>Rp ${fmt(p.kasbon)}</td></tr>` : ''}
        ${p.potonganLain ? `<tr><td>Potongan Lain-lain</td><td>Rp ${fmt(p.potonganLain)}</td></tr>` : ''}
        <tr class="total-row"><td>Total Potongan</td><td>Rp ${fmt(p.totalPotongan)}</td></tr>
      </table>
    </div>
  </div>

  <div class="net-box">
    <div class="label">Gaji Bersih Diterima</div>
    <div class="amount">Rp ${fmt(p.gajiBersih)}</div>
  </div>

  ${p.notes ? `<div class="notes-box"><strong>Catatan:</strong> ${p.notes}</div>` : ''}

  <div class="footer">
    <div class="sign-box">
      <div class="sign-line">${p.employee.name}</div>
      <div class="sign-label">Tanda Tangan Karyawan</div>
    </div>
    <div class="sign-box">
      <div class="sign-line">HRD / Direktur</div>
      <div class="sign-label">${p.company.name}</div>
    </div>
  </div>

  <div class="confidential">KONFIDENSIAL — HANYA UNTUK YANG BERSANGKUTAN</div>
</div>
</body>
</html>`;
}

module.exports = router;
module.exports.generatePayslipHTML = generatePayslipHTML;
