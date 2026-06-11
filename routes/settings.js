const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const dataDir = path.join(__dirname, '..', 'data');
const settingsFile = path.join(dataDir, 'settings.json');
const publicDir = path.join(__dirname, '..', 'public', 'img');

if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, publicDir),
  filename: (req, file, cb) => cb(null, 'company-logo' + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 } });

router.get('/', (req, res) => {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsFile));
    res.json({ success: true, data: settings });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/', upload.single('logo'), (req, res) => {
  try {
    const current = JSON.parse(fs.readFileSync(settingsFile));
    const body = req.body;

    const updated = {
      ...current,
      companyName: body.companyName || current.companyName,
      companyAddress: body.companyAddress || current.companyAddress,
      companyPhone: body.companyPhone || current.companyPhone,
      companyEmail: body.companyEmail || current.companyEmail,
      companyNPWP: body.companyNPWP || current.companyNPWP,
      currency: body.currency || current.currency,
      pph21Method: body.pph21Method || current.pph21Method,
      smtp: {
        host: body.smtpHost || current.smtp.host,
        port: parseInt(body.smtpPort) || current.smtp.port,
        user: body.smtpUser || current.smtp.user,
        pass: body.smtpPass !== undefined ? body.smtpPass : current.smtp.pass,
        from: body.smtpFrom || current.smtp.from
      },
      bpjsKesehatan: {
        employee: parseFloat(body.bpjsKesehatanEmployee) || current.bpjsKesehatan.employee,
        employer: parseFloat(body.bpjsKesehatanEmployer) || current.bpjsKesehatan.employer
      },
      bpjsKetenagakerjaan: {
        jht_employee: parseFloat(body.jhtEmployee) || current.bpjsKetenagakerjaan.jht_employee,
        jht_employer: parseFloat(body.jhtEmployer) || current.bpjsKetenagakerjaan.jht_employer,
        jp_employee: parseFloat(body.jpEmployee) || current.bpjsKetenagakerjaan.jp_employee,
        jp_employer: parseFloat(body.jpEmployer) || current.bpjsKetenagakerjaan.jp_employer,
        jkk: parseFloat(body.jkk) || current.bpjsKetenagakerjaan.jkk,
        jkm: parseFloat(body.jkm) || current.bpjsKetenagakerjaan.jkm
      }
    };

    if (req.file) {
      updated.logo = '/img/' + req.file.filename;
    }

    fs.writeFileSync(settingsFile, JSON.stringify(updated, null, 2));
    res.json({ success: true, message: 'Settings saved!', data: updated });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
