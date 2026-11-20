import type { DB, Question } from './types'

const q = (id: string, text: string, options: string[], answer: number): Question => ({ id, tipe: 'pg', text, options, key: [answer] })

export function seedDB(): DB {
  const now = Date.now()
  const pendingin: Question[] = [
    q('q1', 'Komponen yang berfungsi mengatur aliran air pendingin ke radiator berdasarkan suhu mesin adalah ...', ['Pompa air', 'Termostat', 'Kipas radiator', 'Tutup radiator'], 1),
    q('q2', 'Pada suhu kerja normal, termostat mulai membuka pada kisaran ...', ['40–50 °C', '60–65 °C', '80–90 °C', '110–120 °C'], 2),
    q('q3', 'Fungsi utama tutup radiator bertekanan adalah ...', ['Menyaring kotoran', 'Menaikkan titik didih air pendingin', 'Mendinginkan oli', 'Menurunkan tekanan ban'], 1),
    q('q4', 'Gejala kebocoran gasket kepala silinder ke saluran air pendingin ditandai dengan ...', ['Asap putih dan air radiator berkurang', 'Lampu rem menyala', 'Ban cepat aus', 'Aki cepat habis'], 0),
    q('q5', 'Cairan yang paling tepat untuk sistem pendingin mesin modern adalah ...', ['Air sumur', 'Air hujan', 'Coolant sesuai spesifikasi pabrik', 'Minyak rem'], 2),
  ]
  const listrik: Question[] = [
    q('k1', 'Satuan hambatan listrik adalah ...', ['Volt', 'Ampere', 'Ohm', 'Watt'], 2),
    q('k2', 'Alat ukur yang dipasang seri dengan beban untuk mengukur arus adalah ...', ['Voltmeter', 'Amperemeter', 'Ohmmeter', 'Megger'], 1),
    q('k3', 'Tegangan nominal aki kendaraan penumpang pada umumnya adalah ...', ['6 V', '12 V', '24 V', '48 V'], 1),
    q('k4', 'Komponen yang menaikkan tegangan aki menjadi tegangan tinggi pada sistem pengapian adalah ...', ['Relay', 'Sekring', 'Koil pengapian', 'Regulator'], 2),
    { id: 'k5', tipe: 'bs', text: 'Pada sistem 12 V, aki menyediakan tegangan nominal sekitar 12 volt.', options: ['Benar', 'Salah'], key: [0] },
    { id: 'k6', tipe: 'pgk', text: 'Komponen yang termasuk sistem pengisian (pilih semua yang benar):', options: ['Alternator', 'Regulator tegangan', 'Busi', 'Dioda penyearah'], key: [0, 1, 3] },
  ]

  const base = { batasAkhir: null as number | null, acakSoal: true, acakOpsi: true, maxPelanggaran: 3, wajibFullscreen: true, kunciMaju: false, tampilNilai: true, createdAt: now }
  const tasks = [
    { id: 't1', judul: 'Sistem Pendingin Mesin', mapel: 'Pemeliharaan Mesin Kendaraan Ringan', kelas: ['XI TKRO 1'], durasi: 15, kkm: 75, aktif: true, questions: pendingin, ...base },
    { id: 't2', judul: 'Dasar Kelistrikan Otomotif', mapel: 'Dasar Teknik Otomotif', kelas: ['XI TKRO 1'], durasi: 10, kkm: 70, aktif: false, questions: listrik, ...base, acakOpsi: false, kunciMaju: true },
  ]

  const students = [
    { id: 's1', nama: 'Ahmad Fauzi', nis: '1001', kelas: 'XI TKRO 1', pin: '1001', locked: false, failedLogin: 0 },
    { id: 's2', nama: 'Bayu Pratama', nis: '1002', kelas: 'XI TKRO 1', pin: '1002', locked: false, failedLogin: 0 },
    { id: 's3', nama: 'Citra Lestari', nis: '1003', kelas: 'XI TKRO 1', pin: '1003', locked: true, failedLogin: 3 },
    { id: 's4', nama: 'Dimas Saputra', nis: '1004', kelas: 'XI TKRO 1', pin: '1004', locked: true, failedLogin: 0 },
    { id: 's5', nama: 'Eka Wulandari', nis: '1005', kelas: 'XI TKRO 1', pin: '1005', locked: false, failedLogin: 0 },
    { id: 's6', nama: 'Farhan Hidayat', nis: '1006', kelas: 'XI TKRO 2', pin: '1006', locked: false, failedLogin: 0 },
  ]

  const done = (id: string, studentId: string, score: number, ans: number[], violations = 0) => ({
    id,
    taskId: 't1',
    studentId,
    startedAt: now - 3_600_000,
    endsAt: now - 3_600_000 + 15 * 60_000,
    finishedAt: now - 3_000_000,
    order: pendingin.map((x) => x.id),
    optionOrder: Object.fromEntries(pendingin.map((x) => [x.id, [0, 1, 2, 3]])),
    answers: Object.fromEntries(pendingin.map((x, i) => [x.id, [ans[i]]])),
    cursor: 0,
    violations: Array.from({ length: violations }, (_, i) => ({ t: now - 3_300_000 + i * 1000, type: 'tab' as const })),
    status: 'selesai' as const,
    score,
    resets: 0,
  })

  const attempts = [
    done('a1', 's1', 100, [1, 2, 1, 0, 2]),
    done('a2', 's2', 40, [1, 0, 1, 2, 3], 1),
    {
      ...done('a3', 's4', 60, [1, 2, 0, 0, 0], 3),
      status: 'terkunci' as const,
      score: undefined,
      finishedAt: undefined,
      violations: [
        { t: now - 3_400_000, type: 'tab' as const },
        { t: now - 3_380_000, type: 'fullscreen' as const },
        { t: now - 3_350_000, type: 'blur' as const },
      ],
    },
  ]

  const bank = [
    ...pendingin.map((x) => ({ ...x, mapel: 'Pemeliharaan Mesin Kendaraan Ringan', materi: 'Sistem Pendingin Mesin', kelas: 'XI TKRO 1' })),
    ...listrik.map((x) => ({ ...x, mapel: 'Dasar Teknik Otomotif', materi: 'Dasar Kelistrikan Otomotif', kelas: 'XI TKRO 1' })),
  ]
  return { students, tasks, attempts, bank, teacher: { user: 'guru', pass: 'guru123' } } as DB
}
