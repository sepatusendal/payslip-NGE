const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { generatePayslipHTML } = require('./payslip');

const dataDir = path.join(__dirname, '..', 'data');
const settingsFile = path.join(dataDir, 'settings.json');
const payslipsFile = path.join(dataDir, 'payslips.json');

// Test SMTP connection
router.post('/test', async (req, res) => {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsFile));
    const { smtp } = settings;

    if (!smtp.user || !smtp.pass) {
      return res.status(400).json({ success: false, message: 'Konfigurasi SMTP belum diisi di Settings.' });
    }

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass }
    });

    await transporter.verify();
    res.json({ success: true, message: 'Koneksi SMTP berhasil! ✅' });
  } catch (e) {
    res.status(500).json({ success: false, message: `Gagal: ${e.message}` });
  }
});

// Send payslip email
router.post('/send/:payslipId', async (req, res) => {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsFile));
    const { smtp } = settings;

    if (!smtp.user || !smtp.pass) {
      return res.status(400).json({ success: false, message: 'Konfigurasi SMTP belum diisi di Settings.' });
    }

    const payslips = JSON.parse(fs.readFileSync(payslipsFile));
    const payslip = payslips.find(p => p.id === req.params.payslipId);
    if (!payslip) return res.status(404).json({ success: false, message: 'Payslip tidak ditemukan' });

    const toEmail = req.body.email || payslip.employee.email;
    if (!toEmail) return res.status(400).json({ success: false, message: 'Email karyawan tidak tersedia.' });

    const fmt = (n) => new Intl.NumberFormat('id-ID').format(Math.round(n || 0));
    const monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const periodLabel = payslip.month ? `${monthNames[payslip.month - 1]} ${payslip.year}` : payslip.period;

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass }
    });

    const htmlBody = generatePayslipHTML(payslip);

    const emailHTML = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
    <div style="background:#2563eb;padding:24px 32px;color:white;">
      <h1 style="margin:0;font-size:22px;">Slip Gaji ${periodLabel}</h1>
      <p style="margin:8px 0 0;opacity:0.85;">${payslip.company.name}</p>
    </div>
    <div style="padding:32px;">
      <p>Yth. <strong>${payslip.employee.name}</strong>,</p>
      <p style="color:#6b7280;margin-top:8px;">Berikut adalah rincian gaji Anda untuk periode <strong>${periodLabel}</strong>.</p>
      
      <div style="background:#f0f9ff;border-radius:10px;padding:20px;margin:20px 0;text-align:center;">
        <p style="margin:0;color:#6b7280;font-size:13px;">GAJI BERSIH DITERIMA</p>
        <p style="margin:8px 0 0;font-size:32px;font-weight:700;color:#2563eb;">Rp ${fmt(payslip.gajiBersih)}</p>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr style="background:#f8fafc"><td colspan="2" style="padding:10px 12px;font-weight:700;color:#374151;">Pendapatan</td></tr>
        <tr><td style="padding:8px 12px;color:#6b7280;">Gaji Pokok</td><td style="text-align:right;padding:8px 12px;">Rp ${fmt(payslip.gajiPokok)}</td></tr>
        ${payslip.totalTunjangan ? `<tr><td style="padding:8px 12px;color:#6b7280;">Total Tunjangan</td><td style="text-align:right;padding:8px 12px;">Rp ${fmt(payslip.totalTunjangan)}</td></tr>` : ''}
        <tr style="background:#f8fafc"><td colspan="2" style="padding:10px 12px;font-weight:700;color:#374151;">Potongan</td></tr>
        <tr><td style="padding:8px 12px;color:#6b7280;">BPJS (Kesehatan + Ketenagakerjaan)</td><td style="text-align:right;padding:8px 12px;">Rp ${fmt(payslip.bpjs?.totalEmployeeDeduction)}</td></tr>
        <tr><td style="padding:8px 12px;color:#6b7280;">PPh 21</td><td style="text-align:right;padding:8px 12px;">Rp ${fmt(payslip.pph21?.pph21Monthly)}</td></tr>
      </table>

      <p style="margin-top:24px;font-size:13px;color:#9ca3af;">Slip gaji lengkap terlampir. Dokumen ini bersifat konfidensial.</p>
    </div>
    <div style="background:#f8fafc;padding:16px 32px;text-align:center;font-size:12px;color:#9ca3af;">
      ${payslip.company.name} &bull; ${payslip.company.email}
    </div>
  </div>
</body>
</html>`;

    await transporter.sendMail({
      from: `"${payslip.company.name}" <${smtp.from || smtp.user}>`,
      to: toEmail,
      subject: `[Slip Gaji] ${payslip.employee.name} - ${periodLabel}`,
      html: emailHTML,
      attachments: [
        {
          filename: `SlipGaji_${payslip.employee.name.replace(/\s+/g,'_')}_${periodLabel.replace(/\s/g,'_')}.html`,
          content: htmlBody,
          contentType: 'text/html'
        }
      ]
    });

    res.json({ success: true, message: `Slip gaji berhasil dikirim ke ${toEmail} ✅` });
  } catch (e) {
    res.status(500).json({ success: false, message: `Gagal kirim email: ${e.message}` });
  }
});

// Bulk send payslips
router.post('/bulk-send', async (req, res) => {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsFile));
    const { smtp } = settings;
    const { payslipIds } = req.body;

    if (!smtp.user || !smtp.pass) {
      return res.status(400).json({ success: false, message: 'Konfigurasi SMTP belum diisi.' });
    }

    const payslips = JSON.parse(fs.readFileSync(payslipsFile));
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass }
    });

    const results = [];
    for (const id of payslipIds) {
      const payslip = payslips.find(p => p.id === id);
      if (!payslip || !payslip.employee.email) {
        results.push({ id, success: false, message: 'Email tidak tersedia' });
        continue;
      }
      try {
        // Reuse single send logic simplified
        const monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
        const periodLabel = payslip.month ? `${monthNames[payslip.month - 1]} ${payslip.year}` : payslip.period;
        await transporter.sendMail({
          from: `"${payslip.company.name}" <${smtp.from || smtp.user}>`,
          to: payslip.employee.email,
          subject: `[Slip Gaji] ${payslip.employee.name} - ${periodLabel}`,
          html: generatePayslipHTML(payslip),
        });
        results.push({ id, success: true, email: payslip.employee.email });
      } catch (err) {
        results.push({ id, success: false, message: err.message });
      }
    }

    const sent = results.filter(r => r.success).length;
    res.json({ success: true, results, message: `${sent}/${payslipIds.length} email berhasil dikirim` });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
