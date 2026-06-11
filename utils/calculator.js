/**
 * Utility: Indonesian Payroll Calculations
 * PPh 21, BPJS Kesehatan, BPJS Ketenagakerjaan
 */

// PTKP 2024 (Penghasilan Tidak Kena Pajak)
const PTKP = {
  TK0: 54000000,   // Tidak Kawin, 0 tanggungan
  TK1: 58500000,   // Tidak Kawin, 1 tanggungan
  TK2: 63000000,   // Tidak Kawin, 2 tanggungan
  TK3: 67500000,   // Tidak Kawin, 3 tanggungan
  K0:  58500000,   // Kawin, 0 tanggungan
  K1:  63000000,   // Kawin, 1 tanggungan
  K2:  67500000,   // Kawin, 2 tanggungan
  K3:  72000000,   // Kawin, 3 tanggungan
  HB0: 112500000,  // Kawin, penghasilan istri digabung, 0 tanggungan
};

// Tarif PPh 21 Pasal 17 (Efektif mulai 2022)
function calculatePPh21Annual(pkp) {
  let tax = 0;
  if (pkp <= 0) return 0;

  const brackets = [
    { limit: 60000000,   rate: 0.05 },
    { limit: 250000000,  rate: 0.15 },
    { limit: 500000000,  rate: 0.25 },
    { limit: 5000000000, rate: 0.30 },
    { limit: Infinity,   rate: 0.35 }
  ];

  let remaining = pkp;
  let prev = 0;
  for (const bracket of brackets) {
    if (remaining <= 0) break;
    const taxable = Math.min(remaining, bracket.limit - prev);
    tax += taxable * bracket.rate;
    remaining -= taxable;
    prev = bracket.limit;
  }

  return Math.round(tax);
}

function getPTKP(statusPajak) {
  return PTKP[statusPajak] || PTKP['TK0'];
}

/**
 * Calculate monthly PPh 21
 * method: 'gross' | 'nett' | 'gross_up'
 */
function calculatePPh21Monthly(params) {
  const {
    gajiPokok,
    tunjangan = 0,
    bonusMonth = 0,
    statusPajak = 'TK0',
    hasNPWP = true,
    method = 'gross'
  } = params;

  const biayaJabatan = Math.min((gajiPokok + tunjangan) * 0.05, 500000);
  const penghasilanNetoBulanan = gajiPokok + tunjangan + bonusMonth - biayaJabatan;
  const penghasilanNetoSetahun = penghasilanNetoBulanan * 12;
  const ptkp = getPTKP(statusPajak);
  const pkp = Math.max(0, penghasilanNetoSetahun - ptkp);
  const pkpRounded = Math.floor(pkp / 1000) * 1000;

  let pph21Annual = calculatePPh21Annual(pkpRounded);

  // Non-NPWP: tarif 20% lebih tinggi
  if (!hasNPWP) pph21Annual = Math.round(pph21Annual * 1.2);

  const pph21Monthly = Math.round(pph21Annual / 12);

  return {
    biayaJabatan,
    penghasilanNetoBulanan,
    penghasilanNetoSetahun,
    ptkp,
    pkp: pkpRounded,
    pph21Annual,
    pph21Monthly
  };
}

/**
 * Calculate BPJS
 */
function calculateBPJS(gajiPokok, tunjangan, settings) {
  const { bpjsKesehatan, bpjsKetenagakerjaan } = settings;

  // BPJS Kesehatan: batas atas Rp 12 juta
  const gajiDasarKesehatan = Math.min(gajiPokok + tunjangan, 12000000);
  const bpjsKesehatanEmployee = Math.round(gajiDasarKesehatan * (bpjsKesehatan.employee / 100));
  const bpjsKesehatanEmployer = Math.round(gajiDasarKesehatan * (bpjsKesehatan.employer / 100));

  // BPJS Ketenagakerjaan: batas atas JHT & JP Rp 9,077,600
  const gajiDasarKT = Math.min(gajiPokok, 9077600);
  const jhtEmployee = Math.round(gajiDasarKT * (bpjsKetenagakerjaan.jht_employee / 100));
  const jhtEmployer = Math.round(gajiDasarKT * (bpjsKetenagakerjaan.jht_employer / 100));
  const jpEmployee  = Math.round(gajiDasarKT * (bpjsKetenagakerjaan.jp_employee / 100));
  const jpEmployer  = Math.round(gajiDasarKT * (bpjsKetenagakerjaan.jp_employer / 100));
  const jkk = Math.round(gajiDasarKT * (bpjsKetenagakerjaan.jkk / 100));
  const jkm = Math.round(gajiDasarKT * (bpjsKetenagakerjaan.jkm / 100));

  return {
    kesehatan: {
      employee: bpjsKesehatanEmployee,
      employer: bpjsKesehatanEmployer,
      basis: gajiDasarKesehatan
    },
    ketenagakerjaan: {
      jht: { employee: jhtEmployee, employer: jhtEmployer },
      jp:  { employee: jpEmployee,  employer: jpEmployer  },
      jkk: { employer: jkk },
      jkm: { employer: jkm },
      basis: gajiDasarKT
    },
    totalEmployeeDeduction: bpjsKesehatanEmployee + jhtEmployee + jpEmployee,
    totalEmployerCost: bpjsKesehatanEmployer + jhtEmployer + jpEmployer + jkk + jkm
  };
}

/**
 * Main payroll calculator
 */
function calculatePayroll(employee, overrides = {}, settings) {
  const gajiPokok      = overrides.gajiPokok      ?? employee.gajiPokok ?? 0;
  const tunjanganTetap = overrides.tunjanganTetap  ?? employee.tunjanganTetap ?? 0;
  const uangMakan      = overrides.uangMakan       ?? employee.uangMakan ?? 0;
  const uangTransport  = overrides.uangTransport   ?? employee.uangTransport ?? 0;
  const tunjanganLain  = overrides.tunjanganLain   ?? employee.tunjanganLain ?? 0;
  const bonus          = overrides.bonus           ?? 0;
  const lemburJam      = overrides.lemburJam       ?? 0;
  const potonganLain   = overrides.potonganLain    ?? 0;
  const kasbon         = overrides.kasbon          ?? 0;
  const statusPajak    = overrides.statusPajak     ?? employee.statusPajak ?? 'TK0';
  const hasNPWP        = overrides.hasNPWP         ?? employee.hasNPWP ?? true;
  const method         = settings.pph21Method ?? 'gross';

  // Lembur: (gaji pokok / 173) * 1.5 * jam lembur (sesuai UU Ketenagakerjaan)
  const tarifLemburPerJam = gajiPokok / 173;
  const uangLembur = lemburJam > 0
    ? Math.round(tarifLemburPerJam * (lemburJam <= 1 ? 1.5 : 2) * lemburJam)
    : 0;

  const totalTunjangan = tunjanganTetap + uangMakan + uangTransport + tunjanganLain + uangLembur + bonus;
  const totalBruto = gajiPokok + totalTunjangan;

  // BPJS
  const bpjs = calculateBPJS(gajiPokok, tunjanganTetap, settings);

  // PPh 21
  const pph21Data = calculatePPh21Monthly({
    gajiPokok,
    tunjangan: tunjanganTetap,
    bonusMonth: bonus,
    statusPajak,
    hasNPWP,
    method
  });

  const totalPotongan = bpjs.totalEmployeeDeduction + pph21Data.pph21Monthly + potonganLain + kasbon;
  const gajiBersih = totalBruto - totalPotongan;

  return {
    // Input
    gajiPokok, tunjanganTetap, uangMakan, uangTransport,
    tunjanganLain, bonus, lemburJam, uangLembur,
    potonganLain, kasbon, statusPajak, hasNPWP,

    // Calculated
    totalTunjangan,
    totalBruto,
    bpjs,
    pph21: pph21Data,
    totalPotongan,
    gajiBersih,

    // Summary
    employerCost: totalBruto + bpjs.totalEmployerCost
  };
}

module.exports = { calculatePayroll, calculatePPh21Monthly, calculateBPJS, PTKP };
