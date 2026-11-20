export type Role = 'guru' | 'siswa'

export interface Student {
  id: string
  nama: string
  nis: string
  kelas: string
  pin: string
  locked: boolean
  failedLogin: number
  sesiToken?: string // satu akun = satu perangkat
}

/** pg = pilihan ganda (2–5 opsi), pgk = pilihan ganda kompleks (banyak kunci), bs = benar/salah */
export type QType = 'pg' | 'pgk' | 'bs'

export interface Question {
  id: string
  tipe: QType
  text: string
  options: string[]
  key: number[] // indeks opsi asli yang benar (satu untuk pg/bs, bisa banyak untuk pgk)
  bobot?: number // poin soal, default 1
  gambar?: string // data URL (sebelum disimpan) atau URL publik di Supabase Storage
}

export interface BankItem extends Question {
  mapel: string
  materi: string // judul materi
  kelas: string // kosong = umum
}

export interface Task {
  id: string
  judul: string
  mapel: string
  kelas: string[] // kosong = semua kelas; bisa lebih dari satu kelas
  durasi: number // menit
  kkm: number
  acakSoal: boolean
  acakOpsi: boolean
  maxPelanggaran: number
  wajibFullscreen: boolean
  kunciMaju: boolean
  tampilNilai: boolean
  aktif: boolean
  batasAkhir: number | null // timestamp ms; null = tanpa batas
  questions: Question[]
  jumlahSoal?: number // diisi pada mode Supabase untuk siswa, karena soal belum terbuka sebelum mulai
  createdAt: number
}

export type ViolationType = 'tab' | 'blur' | 'fullscreen' | 'salin' | 'shortcut' | 'reload' | 'klik-kanan'

export interface Violation {
  t: number
  type: ViolationType
  note?: string
}

export type AttemptStatus = 'berjalan' | 'selesai' | 'terkunci'

export interface Attempt {
  id: string
  taskId: string
  studentId: string
  startedAt: number
  endsAt: number
  finishedAt?: number
  order: string[]
  optionOrder: Record<string, number[]>
  answers: Record<string, number[]> // qid -> daftar indeks opsi asli yang dipilih
  cursor: number
  violations: Violation[]
  status: AttemptStatus
  score?: number
  resets: number
  ragu?: string[] // qid yang ditandai ragu-ragu
  /** Mode Supabase (ringkas): jumlah soal benar dan jumlah pelanggaran dihitung di server. */
  benar?: number
  jumlahPelanggaran?: number
}

export interface DB {
  students: Student[]
  tasks: Task[]
  bank: BankItem[]
  attempts: Attempt[]
  teacher: { user: string; pass: string }
}

export interface Session {
  role: Role
  studentId?: string
  token?: string
}
