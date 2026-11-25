import { useSyncExternalStore } from 'react'
import { seedDB } from './seed'
import { supabase, supabaseReady } from './lib/supabase'
import * as remote from './remote'
import type { Attempt, BankItem, DB, QType, Question, Role, Session, Student, Task, ViolationType, Violation } from './types'

/** Mode Supabase aktif bila VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY terisi. */
export const remoteOn = supabaseReady

const DB_KEY = 'cbt.db.v5'
const SES_KEY = 'cbt.session.v1'

/* ---------- storage aman (fallback ke memori jika diblokir) ---------- */
const mem: Record<string, string> = {}
function read(store: 'local' | 'session', key: string): string | null {
  try {
    return (store === 'local' ? localStorage : sessionStorage).getItem(key)
  } catch {
    return mem[store + key] ?? null
  }
}
function write(store: 'local' | 'session', key: string, val: string) {
  try {
    ;(store === 'local' ? localStorage : sessionStorage).setItem(key, val)
  } catch {
    mem[store + key] = val
  }
}
function load<T>(store: 'local' | 'session', key: string, fallback: () => T): T {
  const raw = read(store, key)
  if (raw) {
    try {
      return JSON.parse(raw) as T
    } catch {
      /* abaikan */
    }
  }
  return fallback()
}

const emptyDB = (): DB => ({ students: [], tasks: [], bank: [], attempts: [], teacher: { user: '', pass: '' } })
const errText = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e))

/* ---------- store minimalis ---------- */
let db: DB = remoteOn ? emptyDB() : load('local', DB_KEY, seedDB)
let session: Session | null = load<Session | null>('session', SES_KEY, () => null)
let syncError: string | null = null
const listeners = new Set<() => void>()
let saveTimer: number | undefined
let pollTimer: number | undefined

function emit() {
  listeners.forEach((l) => l())
}
function persistDB() {
  if (remoteOn) return // mode Supabase: sumber kebenaran ada di server
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => write('local', DB_KEY, JSON.stringify(db)), 150)
}
function setDB(next: DB) {
  db = next
  persistDB()
  emit()
}
function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export const useDB = () => useSyncExternalStore(subscribe, () => db)
export const useSession = () => useSyncExternalStore(subscribe, () => session)
export const useSyncError = () => useSyncExternalStore(subscribe, () => syncError)
export const dismissSyncError = () => {
  syncError = null
  emit()
}
export const getDB = () => db
export const uid = (p = 'id') => (remoteOn ? crypto.randomUUID() : p + Math.random().toString(36).slice(2, 9))

/* ---------- sinkronisasi ke Supabase ---------- */
function reportError(label: string, e: unknown) {
  syncError = `${label}: ${errText(e)}`
  emit()
}

// Semua tulisan ke server berjalan berurutan agar tidak saling mendahului.
let writeChain: Promise<void> = Promise.resolve()
let pendingWrites = 0
function enqueueWrite(label: string, fn: () => Promise<unknown>, onOk?: () => Promise<unknown>) {
  pendingWrites++
  writeChain = writeChain
    .then(fn)
    .then(
      () => (onOk ? onOk().then(() => undefined, () => undefined) : undefined),
      (e) => {
        reportError(label, e)
        return refreshRemote().then(() => undefined, () => undefined)
      },
    )
    .finally(() => {
      pendingWrites--
    })
}

async function loadFor(role: Role | undefined) {
  const snap = role === 'siswa' ? await remote.loadSiswaSnapshot() : await remote.loadGuruSnapshot()
  // Posisi soal aktif hanya disimpan di peramban, jadi dipertahankan saat data dimuat ulang.
  const cursorOf = new Map(db.attempts.map((a) => [a.id, a.cursor]))
  const attempts = snap.attempts.map((a) => ({ ...a, cursor: cursorOf.get(a.id) ?? a.cursor }))
  db = { ...db, ...snap, attempts }
  emit()
}

/** Memuat ulang data sesuai peran yang sedang masuk. */
export async function refreshRemote() {
  await loadFor(session?.role)
}

function startPolling() {
  stopPolling()
  // Siswa: cek perubahan tiap 20 detik (misalnya sesi dipindah ke perangkat lain).
  pollTimer = window.setInterval(() => {
    if (pendingWrites === 0 && session?.role === 'siswa') refreshRemote().catch(() => {})
  }, 20_000)
}
function stopPolling() {
  window.clearInterval(pollTimer)
}

/* ---------- helper ---------- */
export const isExpired = (t: Task) => t.batasAkhir !== null && Date.now() > t.batasAkhir
export const effectiveEnd = (a: Attempt, t: Task) => Math.min(a.endsAt, t.batasAkhir ?? Infinity)
export const isAnswered = (a: Attempt, qid: string) =>
  (a.answers[qid] ?? []).some((x) => x >= 0) || !!a.teks?.[qid]?.trim()
/** Teks isian dibandingkan tanpa huruf besar/kecil dan tanpa spasi berlebih. */
export const normTeks = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()
export const taskAudience = (t: Task, kelas: string) => t.kelas.length === 0 || t.kelas.includes(kelas)
export const jumlahSoal = (t: Task) => t.jumlahSoal ?? t.questions.length
const sameSet = (x: number[] = [], y: number[] = []) =>
  x.length === y.length && [...x].sort((a, b) => a - b).join() === [...y].sort((a, b) => a - b).join()

/* ---------- sesi ---------- */
export function setSession(s: Session | null) {
  session = s
  write('session', SES_KEY, JSON.stringify(s))
  emit()
}

/** Dipanggil sekali saat aplikasi dibuka dalam mode Supabase. */
export async function bootRemote() {
  if (!supabase) return
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      stopPolling()
      db = emptyDB()
      setSession(null)
    }
  })
  const { data } = await supabase.auth.getSession()
  if (!data.session) {
    setSession(null)
    return
  }
  try {
    const role = await remote.roleSaya()
    if (role?.peran === 'siswa') {
      await loadFor('siswa')
      // Token perangkat dipakai ulang bila tab ini sudah pernah masuk; jika tidak, perangkat ini mengambil alih.
      const token = session?.role === 'siswa' && session.token ? session.token : crypto.randomUUID()
      if (!(session?.token === token)) await remote.klaimSesi(token)
      setSession({ role: 'siswa', studentId: db.students[0].id, token })
      startPolling()
    } else if (role?.peran === 'guru') {
      await loadFor('guru')
      setSession({ role: 'guru' })
    } else {
      await supabase.auth.signOut()
      setSession(null)
    }
  } catch (e) {
    reportError('Memuat data', e)
    setSession(null)
  }
}

/** Masuk guru. Mode Supabase memakai email dan sandi di Supabase Auth. */
export async function loginGuruRemote(email: string, pass: string): Promise<string | null> {
  const err = await remote.guruSignIn(email, pass)
  if (err) return err
  try {
    await loadFor('guru')
    setSession({ role: 'guru' })
    return null
  } catch (e) {
    return 'Gagal memuat data: ' + errText(e)
  }
}

/** Masuk siswa. Mode Supabase: email internal <nis>@sekolah.local dan PIN sebagai sandi. */
export async function loginSiswaRemote(nis: string, pin: string): Promise<string | null> {
  const r = await remote.siswaSignIn(nis, pin)
  if (r.error) return r.error
  try {
    const token = crypto.randomUUID()
    await remote.klaimSesi(token) // login ini menggantikan sesi di perangkat lain
    await loadFor('siswa')
    setSession({ role: 'siswa', studentId: db.students[0].id, token })
    startPolling()
    return null
  } catch (e) {
    await supabase?.auth.signOut()
    return 'Gagal memuat data: ' + errText(e)
  }
}

export function loginGuru(user: string, pass: string): string | null {
  if (remoteOn) return 'Gunakan email dan sandi Supabase.'
  if (user.trim() === db.teacher.user && pass === db.teacher.pass) {
    setSession({ role: 'guru' })
    return null
  }
  return 'Username atau kata sandi salah.'
}

export function loginSiswa(nis: string, pin: string): string | null {
  if (remoteOn) return 'Gunakan NIS dan PIN dari Supabase.'
  const s = db.students.find((x) => x.nis === nis.trim())
  if (!s) return 'NIS tidak ditemukan.'
  if (s.locked) return 'Akun terkunci. Minta guru untuk membuka kunci.'
  if (s.pin !== pin) {
    const failed = s.failedLogin + 1
    const locked = failed >= 3
    setDB({ ...db, students: db.students.map((x) => (x.id === s.id ? { ...x, failedLogin: failed, locked } : x)) })
    return locked ? 'PIN salah 3 kali. Akun dikunci, hubungi guru.' : `PIN salah. Sisa percobaan ${3 - failed}.`
  }
  // satu akun = satu perangkat: login baru menggantikan sesi sebelumnya
  const token = uid('tok')
  setDB({ ...db, students: db.students.map((x) => (x.id === s.id ? { ...x, failedLogin: 0, sesiToken: token } : x)) })
  setSession({ role: 'siswa', studentId: s.id, token })
  return null
}

export const logout = () => {
  if (remoteOn) {
    stopPolling()
    void supabase?.auth.signOut()
    db = emptyDB()
  }
  setSession(null)
}

/* ---------- siswa (data guru) ---------- */
export function addStudents(list: Omit<Student, 'id' | 'locked' | 'failedLogin'>[]): { added: number; skipped: number } {
  if (remoteOn) {
    const existing = new Set(db.students.map((s) => s.nis))
    const fresh = list.filter((s) => {
      if (!s.nama || !s.nis || existing.has(s.nis)) return false
      if (!/^\d{6}$/.test(s.pin ?? '')) return false
      existing.add(s.nis)
      return true
    })
    if (fresh.length) {
      enqueueWrite(
        'Tambah siswa',
        async () => {
          const r = await remote.kelolaSiswa({ action: 'tambah', siswa: fresh })
          if (Array.isArray(r.errors) && r.errors.length) throw new Error(r.errors.join('; '))
        },
        () => refreshRemote(),
      )
    }
    return { added: fresh.length, skipped: list.length - fresh.length }
  }
  const existing = new Set(db.students.map((s) => s.nis))
  const fresh: Student[] = []
  let skipped = 0
  for (const s of list) {
    if (!s.nama || !s.nis || existing.has(s.nis)) {
      skipped++
      continue
    }
    existing.add(s.nis)
    fresh.push({ ...s, id: uid('s'), locked: false, failedLogin: 0 })
  }
  setDB({ ...db, students: [...db.students, ...fresh] })
  return { added: fresh.length, skipped }
}

/** Mengubah data siswa. Mengembalikan pesan galat bila NIS baru sudah dipakai siswa lain. */
export function updateStudent(id: string, patch: Partial<Student>): string | null {
  if (patch.nis !== undefined && db.students.some((s) => s.id !== id && s.nis === patch.nis)) {
    return `NIS ${patch.nis} sudah dipakai siswa lain.`
  }
  setDB({ ...db, students: db.students.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
  if (!remoteOn) return null
  if (patch.pin !== undefined) {
    const pin = patch.pin
    enqueueWrite('Ubah PIN', () => remote.kelolaSiswa({ action: 'ubah_pin', id, pin }))
  }
  if (patch.locked === false) enqueueWrite('Buka kunci', () => remote.unlockStudent(id))
  if (patch.nama !== undefined || patch.kelas !== undefined || patch.nis !== undefined) {
    const cur = db.students.find((x) => x.id === id)
    if (cur) {
      enqueueWrite(
        'Ubah data siswa',
        () => remote.kelolaSiswa({ action: 'ubah', id, nama: cur.nama, kelas: cur.kelas, nis: cur.nis }),
        () => refreshRemote(),
      )
    }
  }
  return null
}

export function removeStudent(id: string) {
  setDB({ ...db, students: db.students.filter((s) => s.id !== id), attempts: db.attempts.filter((a) => a.studentId !== id) })
  if (remoteOn) enqueueWrite('Hapus siswa', () => remote.kelolaSiswa({ action: 'hapus', id }), () => refreshRemote())
}

export function unlockStudent(id: string) {
  setDB({
    ...db,
    students: db.students.map((s) => (s.id === id ? { ...s, locked: false, failedLogin: 0 } : s)),
    attempts: db.attempts.map((a) =>
      a.studentId === id && a.status === 'terkunci'
        ? { ...a, status: 'berjalan', violations: [], endsAt: Math.max(a.endsAt, Date.now() + 60_000) }
        : a,
    ),
  })
  if (remoteOn) enqueueWrite('Buka kunci', () => remote.unlockStudent(id))
}

/* ---------- penugasan ---------- */
export function saveTask(task: Task) {
  const t = { ...task, questions: task.questions.map(rapikanSoal) }
  const exists = db.tasks.some((x) => x.id === t.id)
  setDB({ ...db, tasks: exists ? db.tasks.map((x) => (x.id === t.id ? t : x)) : [t, ...db.tasks] })
  if (remoteOn) enqueueWrite('Simpan penugasan', () => remote.saveTask(t), () => refreshRemote())
}
export function removeTask(id: string) {
  setDB({ ...db, tasks: db.tasks.filter((t) => t.id !== id), attempts: db.attempts.filter((a) => a.taskId !== id) })
  if (remoteOn) enqueueWrite('Hapus penugasan', () => remote.removeTask(id))
}
export function toggleTask(id: string) {
  const t = db.tasks.find((x) => x.id === id)
  setDB({ ...db, tasks: db.tasks.map((x) => (x.id === id ? { ...x, aktif: !x.aktif } : x)) })
  if (remoteOn && t) enqueueWrite('Ubah status penugasan', () => remote.setTaskAktif(id, !t.aktif))
}
/** Membersihkan isi soal sebelum disimpan: spasi di ujung dibuang, jawaban isian kosong dihapus. */
export function rapikanSoal<T extends Question>(q: T): T {
  const bersih = (xs: string[]) => xs.map((s) => s.trim())
  return {
    ...q,
    text: q.text.trim(),
    options: q.tipe === 'isian' ? [] : bersih(q.options),
    kiri: q.tipe === 'jodoh' && q.kiri ? bersih(q.kiri) : undefined,
    kunciTeks: q.tipe === 'isian' ? [...new Set(bersih(q.kunciTeks ?? []).filter(Boolean))] : undefined,
  }
}

export const emptyQuestion = (tipe: QType = 'pg'): Question => ({
  id: uid('q'),
  tipe,
  text: '',
  options: tipe === 'bs' ? ['Benar', 'Salah'] : ['', '', '', ''],
  key: [0],
})
export const emptyTask = (): Task => ({
  id: uid('t'),
  judul: '',
  mapel: '',
  kelas: [],
  durasi: 30,
  kkm: 75,
  acakSoal: true,
  acakOpsi: true,
  maxPelanggaran: 3,
  wajibFullscreen: true,
  kunciMaju: false,
  tampilNilai: true,
  aktif: false,
  batasAkhir: null,
  questions: [emptyQuestion()],
  createdAt: Date.now(),
})

/* ---------- ujian ---------- */
export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const findAttempt = (taskId: string, studentId: string) =>
  db.attempts.find((a) => a.taskId === taskId && a.studentId === studentId)

/** Mulai ujian. Mode Supabase: server mengacak soal dan menetapkan batas waktu. */
export async function beginAttempt(task: Task, studentId: string): Promise<Attempt | null> {
  if (!remoteOn) return startAttempt(task, studentId)
  try {
    const percobaanId = await remote.mulaiUjian(task.id)
    await loadFor('siswa')
    return db.attempts.find((a) => a.id === percobaanId) ?? null
  } catch (e) {
    reportError('Mulai ujian', e)
    return null
  }
}

/** Mengembalikan null jika penugasan sudah melewati batas akhir (mode lokal). */
export function startAttempt(task: Task, studentId: string): Attempt | null {
  const existing = findAttempt(task.id, studentId)
  if (existing) return existing
  if (isExpired(task)) return null
  const ids = task.questions.map((x) => x.id)
  const order = task.acakSoal ? shuffle(ids) : ids
  const optionOrder: Record<string, number[]> = {}
  for (const qq of task.questions) {
    const idx = qq.options.map((_, i) => i)
    optionOrder[qq.id] = task.acakOpsi ? shuffle(idx) : idx
  }
  const now = Date.now()
  const a: Attempt = {
    id: uid('a'),
    taskId: task.id,
    studentId,
    startedAt: now,
    endsAt: now + task.durasi * 60_000,
    order,
    optionOrder,
    answers: {},
    cursor: 0,
    violations: [],
    status: 'berjalan',
    resets: 0,
  }
  setDB({ ...db, attempts: [...db.attempts, a] })
  return a
}

function patchAttempt(id: string, fn: (a: Attempt) => Attempt) {
  setDB({ ...db, attempts: db.attempts.map((a) => (a.id === id ? fn(a) : a)) })
}

/** Kirim jawaban satu soal ke server (mode Supabase). */
function sendAnswer(attemptId: string, qid: string) {
  const a = db.attempts.find((x) => x.id === attemptId)
  if (!a) return
  const pilihan = a.answers[qid] ?? []
  const ragu = (a.ragu ?? []).includes(qid)
  const teks = a.teks?.[qid] ?? null
  enqueueWrite('Simpan jawaban', () => remote.simpanJawaban(attemptId, qid, pilihan, ragu, teks))
}

/** Isian: teks disimpan di peramban saat mengetik; ke server saat kolom kehilangan fokus (kirimTeks). */
export function setTeks(attemptId: string, qid: string, teks: string) {
  patchAttempt(attemptId, (a) => {
    if (a.status !== 'berjalan') return a
    return { ...a, teks: { ...(a.teks ?? {}), [qid]: teks.slice(0, 1000) } }
  })
}
export function kirimTeks(attemptId: string, qid: string) {
  if (remoteOn) sendAnswer(attemptId, qid)
}

/** Menjodohkan: pilih kanan untuk item kiri ke-kiriIdx. Posisi lain tetap. */
export function answerPasangan(attemptId: string, qid: string, kiriIdx: number, kananOrig: number) {
  patchAttempt(attemptId, (a) => {
    if (a.status !== 'berjalan') return a
    const task = db.tasks.find((t) => t.id === a.taskId)
    const q = task?.questions.find((x) => x.id === qid)
    const panjang = q?.kiri?.length ?? 0
    const cur = [...(a.answers[qid] ?? [])]
    while (cur.length < panjang) cur.push(-1)
    // Satu kanan hanya boleh dipasangkan sekali: lepas pasangan lama yang memakai kanan ini.
    const next = cur.map((x, i) => (i === kiriIdx ? kananOrig : x === kananOrig ? -1 : x))
    return { ...a, answers: { ...a.answers, [qid]: next } }
  })
  if (remoteOn) sendAnswer(attemptId, qid)
}

/** Pilpg/BS: mengganti pilihan. PGK: menambah/menghapus pilihan. */
export function answer(attemptId: string, qid: string, orig: number) {
  patchAttempt(attemptId, (a) => {
    if (a.status !== 'berjalan') return a
    const task = db.tasks.find((t) => t.id === a.taskId)
    const q = task?.questions.find((x) => x.id === qid)
    const cur = a.answers[qid] ?? []
    const next =
      q?.tipe === 'pgk' ? (cur.includes(orig) ? cur.filter((x) => x !== orig) : [...cur, orig]) : [orig]
    return { ...a, answers: { ...a.answers, [qid]: next } }
  })
  if (remoteOn) sendAnswer(attemptId, qid)
}
export function setCursor(attemptId: string, cursor: number) {
  patchAttempt(attemptId, (a) => (a.status === 'berjalan' ? { ...a, cursor } : a))
}

/** Bagian nilai satu soal (0–1).
 *  PG dan BS: benar atau salah. PG kompleks: max(0, benar - salah) / jumlah kunci.
 *  Isian: penuh jika cocok dengan salah satu jawaban yang diterima, selain itu 0.
 *  Menjodohkan: pasangan benar / jumlah pasangan (nilai parsial). */
export function fraksiSoal(q: Question, ans: number[] = [], teks = ''): number {
  if (q.tipe === 'isian') {
    const t = normTeks(teks)
    return t && (q.kunciTeks ?? []).some((k) => normTeks(k) === t) ? 1 : 0
  }
  if (q.tipe === 'jodoh') {
    if (!q.key.length) return 0
    const benar = q.key.filter((k, i) => ans[i] === k).length
    return benar / q.key.length
  }
  if (q.tipe === 'pgk') {
    const pilih = [...new Set(ans)]
    const benar = pilih.filter((x) => q.key.includes(x)).length
    const salah = pilih.length - benar
    return q.key.length ? Math.max(0, benar - salah) / q.key.length : 0
  }
  return sameSet(ans, q.key) ? 1 : 0
}
export function correctCount(task: Task, a: Attempt): number {
  if (a.benar !== undefined) return a.benar // mode Supabase: dihitung di server
  return task.questions.filter((qq) => fraksiSoal(qq, a.answers[qq.id], a.teks?.[qq.id]) === 1).length
}
/** Jumlah pelanggaran. Mode Supabase membawa angkanya; daftar lengkapnya dimuat saat dibuka. */
export function jumlahPelanggaranOf(a: Attempt): number {
  return a.jumlahPelanggaran ?? a.violations.length
}
/** Daftar pelanggaran satu percobaan untuk guru. Lokal: dari memori. Supabase: dari server. */
export async function muatPelanggaran(a: Attempt): Promise<Violation[]> {
  if (!remoteOn) return a.violations
  return remote.pelanggaranGuru(a.id)
}
export function computeScore(task: Task, a: Attempt): number {
  if (!task.questions.length) return 0
  const total = task.questions.reduce((n, q) => n + (q.bobot ?? 1), 0)
  const got = task.questions.reduce((n, q) => n + (q.bobot ?? 1) * fraksiSoal(q, a.answers[q.id], a.teks?.[q.id]), 0)
  return total ? Math.round((got / total) * 100) : 0
}

export function finishAttempt(attemptId: string) {
  const before = db.attempts.find((x) => x.id === attemptId)
  if (!before || before.status !== 'berjalan') return
  patchAttempt(attemptId, (a) => {
    if (a.status !== 'berjalan') return a
    const task = db.tasks.find((t) => t.id === a.taskId)!
    // Mode Supabase: skor dihitung server, jadi kunci jawaban tidak perlu ada di peramban siswa.
    return { ...a, status: 'selesai', finishedAt: Date.now(), score: remoteOn ? undefined : computeScore(task, a) }
  })
  if (remoteOn) enqueueWrite('Kirim ujian', () => remote.kirimUjian(attemptId), () => loadFor('siswa'))
}

/** Catat pelanggaran. Mengembalikan jumlah pelanggaran setelah dicatat. */
export function addViolation(attemptId: string, type: ViolationType, note?: string): number {
  const wasRunning = db.attempts.find((x) => x.id === attemptId)?.status === 'berjalan'
  let total = 0
  patchAttempt(attemptId, (a) => {
    if (a.status !== 'berjalan') {
      total = a.violations.length
      return a
    }
    const task = db.tasks.find((t) => t.id === a.taskId)!
    const v: Violation = { t: Date.now(), type, note }
    const violations = [...a.violations, v]
    total = violations.length
    const lock = total >= task.maxPelanggaran
    return { ...a, violations, status: lock ? 'terkunci' : a.status }
  })
  if (remoteOn) {
    if (wasRunning) enqueueWrite('Catat pelanggaran', () => remote.catatPelanggaran(attemptId, type, note))
    return total
  }
  const at = db.attempts.find((x) => x.id === attemptId)
  if (at && at.status === 'terkunci') updateStudent(at.studentId, { locked: true })
  return total
}

/** Guru mereset ujian siswa: percobaan dihapus, siswa bisa mengulang dengan soal teracak baru. */
export function resetAttempt(attemptId: string) {
  const a = db.attempts.find((x) => x.id === attemptId)
  if (!a) return
  setDB({
    ...db,
    attempts: db.attempts.filter((x) => x.id !== attemptId),
    students: db.students.map((s) => (s.id === a.studentId ? { ...s, locked: false, failedLogin: 0 } : s)),
  })
  if (remoteOn) enqueueWrite('Reset ujian', () => remote.resetAttempt(attemptId))
}

export function resetAll() {
  if (remoteOn) return
  setDB(seedDB())
  setSession(null)
}

/* ---------- bank soal ---------- */
export function saveBank(input: BankItem) {
  const item = rapikanSoal(input)
  const exists = db.bank.some((x) => x.id === item.id)
  setDB({ ...db, bank: exists ? db.bank.map((x) => (x.id === item.id ? item : x)) : [item, ...db.bank] })
  if (remoteOn) enqueueWrite('Simpan bank soal', () => remote.saveBank(item), () => refreshRemote())
}
export function removeBank(id: string) {
  setDB({ ...db, bank: db.bank.filter((x) => x.id !== id) })
  if (remoteOn) enqueueWrite('Hapus bank soal', () => remote.removeBank(id))
}
/** Mengubah kelas, mapel, atau materi untuk semua soal dalam satu materi sekaligus. */
export function renameBankGroup(
  from: { kelas: string; mapel: string; materi: string },
  to: { kelas: string; mapel: string; materi: string },
) {
  const cocok = (b: BankItem) => (b.kelas || '') === from.kelas && b.mapel === from.mapel && (b.materi || '') === from.materi
  const baru = db.bank.filter(cocok).map((b) => ({ ...b, kelas: to.kelas, mapel: to.mapel, materi: to.materi }))
  if (!baru.length) return
  const idBaru = new Map(baru.map((b) => [b.id, b]))
  setDB({ ...db, bank: db.bank.map((b) => idBaru.get(b.id) ?? b) })
  if (remoteOn) enqueueWrite('Ubah materi bank', async () => { for (const b of baru) await remote.saveBank(b) }, () => refreshRemote())
}

/* ---------- mata pelajaran ---------- */

/** Daftar induk mapel: gabungan daftar tersimpan dan mapel yang sudah dipakai soal atau penugasan. */
export function daftarMapel(): string[] {
  const semua = [...(db.mapel ?? []), ...db.bank.map((b) => b.mapel), ...db.tasks.map((t) => t.mapel)]
  return [...new Set(semua.map((m) => (m ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id'))
}

/** Jumlah soal bank dan penugasan yang memakai satu mapel. */
export function pemakaianMapel(nama: string) {
  return {
    soal: db.bank.filter((b) => b.mapel === nama).length,
    tugas: db.tasks.filter((t) => t.mapel === nama).length,
  }
}

function cekNamaMapel(nama: string, lama?: string): string | null {
  if (!nama) return 'Nama mata pelajaran tidak boleh kosong.'
  if (nama.length > 100) return 'Nama mata pelajaran maksimal 100 karakter.'
  const sama = daftarMapel().find((m) => m.toLowerCase() === nama.toLowerCase() && m !== lama)
  return sama ? `"${sama}" sudah ada.` : null
}

/** Menambah mapel ke daftar. Mengembalikan pesan galat, atau null bila berhasil. */
export function tambahMapel(nama: string): string | null {
  const v = nama.trim()
  const galat = cekNamaMapel(v)
  if (galat) return galat
  setDB({ ...db, mapel: [...new Set([...(db.mapel ?? []), v])] })
  if (remoteOn) enqueueWrite('Tambah mapel', () => remote.tambahMapel(v), () => refreshRemote())
  return null
}

/** Mengganti nama mapel di daftar, soal bank, dan penugasan. */
export function ubahMapel(lama: string, baru: string): string | null {
  const v = baru.trim()
  if (v === lama) return null
  const galat = cekNamaMapel(v, lama)
  if (galat) return galat
  setDB({
    ...db,
    mapel: [...new Set([...(db.mapel ?? []).filter((m) => m !== lama), v])],
    bank: db.bank.map((b) => (b.mapel === lama ? { ...b, mapel: v } : b)),
    tasks: db.tasks.map((t) => (t.mapel === lama ? { ...t, mapel: v } : t)),
  })
  if (remoteOn) enqueueWrite('Ubah mapel', () => remote.ubahMapel(lama, v), () => refreshRemote())
  return null
}

/** Menghapus mapel dari daftar. Ditolak bila masih dipakai soal atau penugasan. */
export function hapusMapel(nama: string): string | null {
  const p = pemakaianMapel(nama)
  if (p.soal + p.tugas > 0) return `"${nama}" masih dipakai ${p.soal} soal dan ${p.tugas} penugasan.`
  setDB({ ...db, mapel: (db.mapel ?? []).filter((m) => m !== nama) })
  if (remoteOn) enqueueWrite('Hapus mapel', () => remote.hapusMapel(nama), () => refreshRemote())
  return null
}

/* ---------- ragu-ragu ---------- */
export function toggleRagu(attemptId: string, qid: string) {
  patchAttempt(attemptId, (a) => {
    if (a.status !== 'berjalan') return a
    const r = a.ragu ?? []
    return { ...a, ragu: r.includes(qid) ? r.filter((x) => x !== qid) : [...r, qid] }
  })
  if (remoteOn) sendAnswer(attemptId, qid)
}

/* ---------- sesi ---------- */
export const getSession = () => session

// Perangkat lain yang login ke akun yang sama akan memperbarui data; tab/perangkat ini ikut membaca perubahan.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (remoteOn) return
    if (e.key === DB_KEY && e.newValue) {
      try {
        db = JSON.parse(e.newValue) as DB
        emit()
      } catch {
        /* abaikan */
      }
    }
  })
}

/* ---------- pengaturan: Supabase & sandi guru ---------- */
export interface SupabaseCfg {
  url: string
  key: string // anon / publishable key saja, jangan service_role
}
const CFG_KEY = 'cbt.supabase.v1'
export function loadSupabaseCfg(): SupabaseCfg {
  try {
    const raw = localStorage.getItem(CFG_KEY)
    if (raw) {
      const c = JSON.parse(raw) as Partial<SupabaseCfg>
      return { url: c.url ?? '', key: c.key ?? '' }
    }
  } catch {
    /* abaikan */
  }
  return { url: '', key: '' }
}
export function saveSupabaseCfg(c: SupabaseCfg) {
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(c))
  } catch {
    /* abaikan */
  }
}
/** Varian mode Supabase: ganti sandi lewat Supabase Auth. */
export async function changeTeacherPasswordRemote(oldP: string, newP: string, confirm: string): Promise<string | null> {
  if (newP.length < 8) return 'Sandi baru minimal 8 karakter.'
  if (newP !== confirm) return 'Konfirmasi sandi tidak sama.'
  try {
    await remote.gantiSandiGuruRemote(oldP, newP)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Gagal mengganti sandi.'
  }
}

export function changeTeacherPassword(oldP: string, newP: string, confirm: string): string | null {
  if (remoteOn) return 'Di mode Supabase, gunakan "Ganti sandi" yang memakai Supabase Auth.'
  if (oldP !== db.teacher.pass) return 'Sandi lama tidak sesuai.'
  if (newP.length < 8) return 'Sandi baru minimal 8 karakter.'
  if (newP !== confirm) return 'Konfirmasi sandi tidak sama.'
  setDB({ ...db, teacher: { ...db.teacher, pass: newP } })
  return null
}
