# 📋 Payslip Generator App

Web app lokal untuk generate slip gaji otomatis dengan perhitungan PPh 21, BPJS, dan kirim email.

## 🚀 Cara Menjalankan

### 1. Install dependencies
```bash
cd payslip-app
npm install
```

### 2. Jalankan app
```bash
npm start
```

### 3. Buka di browser
```
http://localhost:3000
```

---

## ⚙️ Setup Email (Gmail)

Agar bisa kirim slip gaji via email:

1. **Aktifkan 2-Step Verification** di akun Google kamu
2. Buka: https://myaccount.google.com/apppasswords
3. Buat App Password baru (pilih "Mail" → "Other")
4. Copy password yang digenerate (16 karakter)
5. Di app, buka **Settings → Email (SMTP)**:
   - SMTP Host: `smtp.gmail.com`
   - Port: `587`
   - Username: email Gmail kamu
   - App Password: paste 16-karakter tadi
6. Klik **Test Koneksi SMTP** untuk verifikasi

---

## 🗂️ Fitur

### Dashboard
- Statistik karyawan, total payslip, ringkasan bulan ini

### Generate Payslip
- Pilih karyawan, isi komponen gaji
- Preview perhitungan real-time:
  - PPh 21 (sesuai tarif progresif 2024)
  - BPJS Kesehatan (1% karyawan, 4% perusahaan)
  - BPJS Ketenagakerjaan (JHT, JP, JKK, JKM)
  - Uang lembur otomatis (1/173 × 1.5/2 × jam)
  - Bonus / THR, uang makan, transport
  - Kasbon & potongan lain

### Data Karyawan
- CRUD data karyawan
- Data default gaji per karyawan

### Riwayat
- Filter by bulan/tahun
- View slip gaji (printable HTML)
- Kirim email ke karyawan

### Settings
- Nama PT, logo, alamat, NPWP
- Konfigurasi SMTP/Gmail
- Tarif BPJS (bisa disesuaikan)
- Metode PPh 21 (Gross / Nett / Gross Up)

---

## 📂 Struktur Project

```
payslip-app/
├── server.js           # Express server
├── routes/
│   ├── settings.js     # API settings
│   ├── employees.js    # API karyawan
│   ├── payslip.js      # API generate payslip
│   └── email.js        # API kirim email
├── utils/
│   └── calculator.js   # Kalkulasi PPh21, BPJS
├── public/
│   ├── index.html      # Frontend (Notion-style)
│   ├── css/style.css
│   └── js/app.js
└── data/               # Database JSON (auto-created)
    ├── settings.json
    ├── employees.json
    └── payslips.json
```

---

## 💡 Tips

- **Logo PT**: Upload di Settings → Logo Perusahaan (PNG/JPG, max 2MB)
- **Ubah nama PT**: Settings → Data Perusahaan
- **Tarif BPJS custom**: Settings → Tarif BPJS (bisa disesuaikan kebijakan perusahaan)
- **Data tersimpan** di folder `data/` dalam format JSON — bisa di-backup kapan saja
- **Print slip gaji**: Klik "Lihat" → Ctrl+P di browser

---

## v1.1 — Login & Export/Import

### 🔐 Login Admin
Default credentials saat pertama kali jalankan:
- Username: `admin`
- Password: `admin123`

**Ganti password** setelah login pertama via Settings atau User Management.

### 👤 Manajemen User (Admin only)
- Tambah user baru (role: admin / staff)
- Edit nama, password, dan role
- Hapus user (tidak bisa hapus diri sendiri atau admin terakhir)
- Staff hanya bisa lihat & generate payslip, tidak bisa settings/user management

### 📤 Export Payroll
- **CSV**: Download ke Excel/Google Sheets, semua kolom payroll lengkap
- **Cetak Rekap**: Tabel rekapitulasi per periode, langsung print
- **JSON**: Backup data payroll mentah
- Filter by bulan & tahun

### 📥 Import Karyawan
- Upload CSV untuk tambah karyawan massal
- Drag & drop atau pilih file
- Download template CSV yang siap diisi
- Duplikat otomatis dilewati (tidak di-overwrite)
