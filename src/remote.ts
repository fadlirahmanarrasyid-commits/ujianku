// Akses data ke Supabase untuk peran guru dan siswa. Dipanggil dari store.ts.
// Hanya anon key yang dipakai; hak akses ditentukan oleh RLS dan fungsi di database.
import { supabase } from './lib/supabase'
import type { Attempt, BankItem, Question, Student, Task, Violation, ViolationType } from './types'

type Row = Record<string, any>

function client() {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi.')
  return supabase
}

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : null)
const fail = (error: { message: string } | null | undefined) => {
  if (error) throw error
}

export async function currentUserId(): Promise<string | null> {
  const { data } = await client().auth.getUser()
  return data.user?.id ?? null
}

/** Peran akun yang sedang masuk, atau null. */
export async function roleSaya(): Promise<{ peran: 'guru' | 'siswa'; terkunci: boolean } | null> {
  const uid = await currentUserId()
  if (!uid) return null
  const { data, error } = await client().from('profiles').select('peran,terkunci').eq('id', uid).maybeSingle()
  fail(error)
  return data ? { peran: data.peran, terkunci: !!data.terkunci } : null
}

/** Mengembalikan peta nama kelas -> id, membuat kelas yang belum ada. */
export async function ensureKelas(names: string[]): Promise<Map<string, string>> {
  const sb = client()
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
  const { data, error } = await sb.from('kelas').select('id,nama')
  fail(error)
  const map = new Map<string, string>((data ?? []).map((k: Row) => [k.nama, k.id]))
  const missing = wanted.filter((n) => !map.has(n))
  if (missing.length) {
    const { data: created, error: e2 } = await sb.from('kelas').insert(missing.map((nama) => ({ nama }))).select('id,nama')
    fail(e2)
    for (const k of created ?? []) map.set(k.nama, k.id)
  }
  return map
}

export interface Snapshot {
  students: Student[]
  tasks: Task[]
  bank: BankItem[]
  attempts: Attempt[]
  mapel: string[]
}

/* ----------------------------- pemetaan data ----------------------------- */

function mapTasks(tugas: Row[], tk: Row[], soal: Row[], namaKelas: (id: string | null) => string): Task[] {
  const soalByTugas = new Map<string, Question[]>()
  for (const s of soal) {
    const k = Array.isArray(s.kunci_soal) ? s.kunci_soal[0] : s.kunci_soal
    const q: Question = {
      id: s.id, tipe: s.tipe, text: s.teks, options: s.opsi, key: k?.kunci ?? [], bobot: s.bobot, gambar: s.gambar_url ?? undefined,
      kiri: s.kiri ?? undefined, kunciTeks: k?.kunci_teks ?? [],
    }
    const list = soalByTugas.get(s.tugas_id) ?? []
    list.push(q)
    soalByTugas.set(s.tugas_id, list)
  }
  const kelasByTugas = new Map<string, string[]>()
  for (const x of tk) {
    const list = kelasByTugas.get(x.tugas_id) ?? []
    list.push(namaKelas(x.kelas_id))
    kelasByTugas.set(x.tugas_id, list)
  }
  return tugas.map((t) => ({
    id: t.id,
    judul: t.judul,
    mapel: t.mapel,
    kelas: kelasByTugas.get(t.id) ?? [],
    durasi: t.durasi_menit,
    kkm: t.kkm,
    acakSoal: t.acak_soal,
    acakOpsi: t.acak_opsi,
    maxPelanggaran: t.maks_pelanggaran,
    wajibFullscreen: t.wajib_layar_penuh,
    kunciMaju: t.kunci_maju,
    tampilNilai: t.tampil_nilai,
    aktif: t.aktif,
    batasAkhir: ms(t.batas_akhir),
    questions: soalByTugas.get(t.id) ?? [],
    createdAt: ms(t.created_at) ?? 0,
  }))
}

function mapAttempts(
  perc: Row[],
  jaw: Row[],
  pel: Row[],
  scoreOf: (p: Row) => number | undefined,
): Attempt[] {
  const jawabanBy = new Map<string, Row[]>()
  for (const j of jaw) {
    const list = jawabanBy.get(j.percobaan_id) ?? []
    list.push(j)
    jawabanBy.set(j.percobaan_id, list)
  }
  const pelanggaranBy = new Map<string, Row[]>()
  for (const v of pel) {
    const list = pelanggaranBy.get(v.percobaan_id) ?? []
    list.push(v)
    pelanggaranBy.set(v.percobaan_id, list)
  }
  return perc.map((p) => {
    const answers: Record<string, number[]> = {}
    const teks: Record<string, string> = {}
    const ragu: string[] = []
    for (const j of jawabanBy.get(p.id) ?? []) {
      answers[j.soal_id] = j.pilihan ?? []
      if (j.teks) teks[j.soal_id] = j.teks
      if (j.ragu) ragu.push(j.soal_id)
    }
    return {
      id: p.id,
      taskId: p.tugas_id,
      studentId: p.siswa_id,
      startedAt: ms(p.mulai_at) ?? 0,
      endsAt: ms(p.selesai_batas) ?? 0,
      finishedAt: ms(p.selesai_at) ?? undefined,
      order: p.urutan_soal ?? [],
      optionOrder: p.urutan_opsi ?? {},
      answers,
      teks,
      cursor: 0,
      violations: (pelanggaranBy.get(p.id) ?? []).map((v) => ({
        t: ms(v.waktu) ?? 0,
        type: v.tipe as ViolationType,
        note: v.catatan ?? undefined,
      })),
      status: p.status,
      score: scoreOf(p),
      resets: 0,
      ragu,
    }
  })
}

/* ----------------------------- muat: guru ----------------------------- */

/** Memuat seluruh data yang boleh dilihat guru yang sedang masuk. */
export async function loadGuruSnapshot(): Promise<Snapshot> {
  const sb = client()
  // Ringkasan hasil dihitung di server (migrasi 0008): jawaban dan pelanggaran tidak diunduh semua.
  const [kelasR, profR, tugasR, tkR, soalR, bankR, ringkasR, mapelR] = await Promise.all([
    sb.from('kelas').select('id,nama'),
    sb.from('profiles').select('id,nama,nis,kelas_id,terkunci').eq('peran', 'siswa'),
    sb.from('tugas').select('*'),
    sb.from('tugas_kelas').select('tugas_id,kelas_id'),
    sb.from('soal').select('*, kunci_soal(kunci,kunci_teks)').order('urutan'),
    sb.from('bank_soal').select('*'),
    sb.rpc('ringkasan_guru'),
    sb.from('mapel').select('nama').order('nama'),
  ])
  for (const r of [kelasR, profR, tugasR, tkR, soalR, bankR, ringkasR, mapelR]) fail(r.error)

  const kelasNama = new Map<string, string>((kelasR.data ?? []).map((k: Row) => [k.id, k.nama]))
  const namaKelas = (id: string | null) => (id ? kelasNama.get(id) ?? '' : '')

  const students: Student[] = (profR.data ?? []).map((p: Row) => ({
    id: p.id,
    nama: p.nama,
    nis: p.nis ?? '',
    kelas: namaKelas(p.kelas_id),
    pin: '',
    locked: !!p.terkunci,
    failedLogin: 0,
  }))

  const tasks = mapTasks(tugasR.data ?? [], tkR.data ?? [], soalR.data ?? [], namaKelas)

  const bank: BankItem[] = (bankR.data ?? []).map((b: Row) => ({
    id: b.id,
    tipe: b.tipe,
    text: b.teks,
    options: b.opsi,
    key: b.kunci,
    kiri: b.kiri ?? undefined,
    kunciTeks: b.kunci_teks ?? [],
    bobot: b.bobot,
    mapel: b.mapel,
    materi: b.materi,
    kelas: namaKelas(b.kelas_id),
    gambar: b.gambar_url ?? undefined,
  }))

  const attempts = (ringkasR.data ?? []).map(attemptDariRingkasan)
  const mapel = (mapelR.data ?? []).map((m: Row) => m.nama as string)
  return { students, tasks, bank, attempts, mapel }
}

function attemptDariRingkasan(r: Row): Attempt {
  return {
    id: r.id,
    taskId: r.tugas_id,
    studentId: r.siswa_id,
    startedAt: ms(r.mulai_at) ?? 0,
    endsAt: ms(r.selesai_batas) ?? 0,
    finishedAt: ms(r.selesai_at) ?? undefined,
    order: r.urutan_soal ?? [],
    optionOrder: r.urutan_opsi ?? {},
    answers: {},
    cursor: 0,
    violations: [],
    status: r.status,
    score: r.skor ?? undefined,
    resets: 0,
    ragu: [],
    benar: r.benar ?? 0,
    jumlahPelanggaran: r.jumlah_pelanggaran ?? 0,
  }
}

/** Daftar pelanggaran satu percobaan, dimuat saat guru membuka catatannya. */
export async function pelanggaranGuru(percobaanId: string): Promise<Violation[]> {
  const { data, error } = await client().rpc('pelanggaran_guru', { p_percobaan: percobaanId })
  fail(error)
  return (data ?? []).map((v: Row) => ({ t: ms(v.waktu) ?? 0, type: v.tipe as ViolationType, note: v.catatan ?? undefined }))
}

/* ----------------------------- muat: siswa ----------------------------- */

/** Data siswa yang sedang masuk. Soal hanya terlihat setelah ujian dimulai (diatur RLS). */
export async function loadSiswaSnapshot(): Promise<Snapshot> {
  const sb = client()
  const uid = await currentUserId()
  if (!uid) throw new Error('Sesi berakhir, silakan masuk lagi.')
  const [profR, kelasR, tugasR, tkR, soalR, percR, jawR, nilaiR, ringkasR] = await Promise.all([
    sb.from('profiles').select('id,nama,nis,kelas_id,terkunci,sesi_aktif').eq('id', uid).single(),
    sb.from('kelas').select('id,nama'),
    sb.from('tugas').select('*').eq('aktif', true),
    sb.from('tugas_kelas').select('tugas_id,kelas_id'),
    sb.from('soal').select('*').order('urutan'),
    sb.from('percobaan').select('*').eq('siswa_id', uid),
    sb.from('jawaban').select('*'),
    sb.rpc('nilai_saya'),
    sb.rpc('ringkasan_tugas_siswa'),
  ])
  for (const r of [profR, kelasR, tugasR, tkR, soalR, percR, jawR, nilaiR, ringkasR]) fail(r.error)

  const kelasNama = new Map<string, string>((kelasR.data ?? []).map((k: Row) => [k.id, k.nama]))
  const namaKelas = (id: string | null) => (id ? kelasNama.get(id) ?? '' : '')

  const p = profR.data as Row
  const me: Student = {
    id: p.id,
    nama: p.nama,
    nis: p.nis ?? '',
    kelas: namaKelas(p.kelas_id),
    pin: '',
    locked: !!p.terkunci,
    failedLogin: 0,
    sesiToken: p.sesi_aktif ?? undefined,
  }

  const tasks = mapTasks(tugasR.data ?? [], tkR.data ?? [], soalR.data ?? [], namaKelas)
  const jumlah = new Map<string, number>((ringkasR.data ?? []).map((r: Row) => [r.tugas_id, r.jumlah_soal]))
  for (const t of tasks) t.jumlahSoal = jumlah.get(t.id) ?? t.questions.length

  const nilaiByTugas = new Map<string, number>((nilaiR.data ?? []).map((n: Row) => [n.tugas_ref, n.nilai_skor]))
  const attempts = mapAttempts(percR.data ?? [], jawR.data ?? [], [], (x) => nilaiByTugas.get(x.tugas_id))

  // Pelanggaran percobaan yang masih berjalan dibaca dari server agar hitungannya tidak kembali nol saat dimuat ulang.
  const berjalan = attempts.filter((a) => a.status === 'berjalan' || a.status === 'terkunci')
  const pelBy = new Map<string, Violation[]>(
    await Promise.all(berjalan.map(async (a) => [a.id, await daftarPelanggaranSaya(a.id).catch(() => [])] as const)),
  )
  for (const a of attempts) {
    const v = pelBy.get(a.id)
    if (v) a.violations = v
  }
  return { students: [me], tasks, bank: [], attempts, mapel: [] }
}

/* ----------------------------- sesi ----------------------------- */

export async function guruSignIn(email: string, password: string): Promise<string | null> {
  const sb = client()
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password })
  if (error) return 'Email atau sandi salah.'
  const role = await roleSaya()
  if (role?.peran !== 'guru') {
    await sb.auth.signOut()
    return 'Akun ini belum terdaftar sebagai guru.'
  }
  return null
}

/** Masuk siswa: email internal <nis>@sekolah.local dengan PIN sebagai sandi. */
export async function siswaSignIn(nis: string, pin: string): Promise<{ error: string | null; userId?: string }> {
  const sb = client()
  const { error } = await sb.auth.signInWithPassword({ email: `${nis.trim()}@sekolah.local`, password: pin.trim() })
  if (error) return { error: 'NIS atau PIN salah.' }
  const role = await roleSaya()
  if (role?.peran !== 'siswa') {
    await sb.auth.signOut()
    return { error: 'Akun ini bukan akun siswa.' }
  }
  if (role.terkunci) {
    await sb.auth.signOut()
    return { error: 'Akun terkunci. Minta guru untuk membuka kunci.' }
  }
  return { error: null, userId: (await currentUserId()) ?? undefined }
}

export async function klaimSesi(token: string) {
  const { error } = await client().rpc('klaim_sesi', { p_token: token })
  fail(error)
}

/* ----------------------------- tulis: guru ----------------------------- */

const BUCKET = 'soal-gambar'

/** Mengunggah gambar data URL ke Supabase Storage dan mengembalikan URL publiknya. */
async function unggahGambar(dataUrl: string, folder: string): Promise<string> {
  const sb = client()
  const blob = await (await fetch(dataUrl)).blob()
  const path = `${folder}/${crypto.randomUUID()}.jpg`
  fail((await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })).error)
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/** Gambar yang masih berupa data URL diunggah dulu; yang sudah URL dibiarkan. */
async function gambarSiap(gambar: string | undefined, folder: string): Promise<string | null> {
  if (!gambar) return null
  return gambar.startsWith('data:') ? unggahGambar(gambar, folder) : gambar
}

export async function saveTask(t: Task) {
  const sb = client()
  const pemilik = await currentUserId()
  if (!pemilik) throw new Error('Sesi berakhir, silakan masuk lagi.')

  const questions = await Promise.all(
    t.questions.map(async (q) => ({ ...q, gambar: (await gambarSiap(q.gambar, pemilik)) ?? undefined })),
  )

  const { error: e1 } = await sb.from('tugas').upsert({
    id: t.id,
    pemilik,
    judul: t.judul,
    mapel: t.mapel,
    durasi_menit: t.durasi,
    kkm: t.kkm,
    acak_soal: t.acakSoal,
    acak_opsi: t.acakOpsi,
    maks_pelanggaran: t.maxPelanggaran,
    wajib_layar_penuh: t.wajibFullscreen,
    kunci_maju: t.kunciMaju,
    tampil_nilai: t.tampilNilai,
    aktif: t.aktif,
    batas_akhir: t.batasAkhir ? new Date(t.batasAkhir).toISOString() : null,
  })
  fail(e1)

  const kmap = await ensureKelas(t.kelas)
  const { error: e2 } = await sb.from('tugas_kelas').delete().eq('tugas_id', t.id)
  fail(e2)
  const kelasRows = t.kelas.filter((k) => kmap.has(k)).map((k) => ({ tugas_id: t.id, kelas_id: kmap.get(k)! }))
  if (kelasRows.length) fail((await sb.from('tugas_kelas').insert(kelasRows)).error)

  // soal: upsert agar jawaban siswa yang sudah ada tidak ikut terhapus
  const ids = questions.map((q) => q.id)
  if (ids.length) {
    fail(
      (
        await sb.from('soal').upsert(
          questions.map((q, i) => ({
            id: q.id,
            tugas_id: t.id,
            urutan: i + 1,
            tipe: q.tipe,
            teks: q.text,
            opsi: q.options,
            kiri: q.kiri ?? null,
            bobot: q.bobot ?? 1,
            gambar_url: q.gambar ?? null,
          })),
        )
      ).error,
    )
  }
  const { data: ada, error: e5 } = await sb.from('soal').select('id').eq('tugas_id', t.id)
  fail(e5)
  const hapus = (ada ?? []).map((r: Row) => r.id as string).filter((id) => !ids.includes(id))
  if (hapus.length) fail((await sb.from('soal').delete().in('id', hapus)).error)
  if (ids.length) {
    fail((await sb.from('kunci_soal').upsert(questions.map((q) => ({ soal_id: q.id, kunci: q.key, kunci_teks: q.kunciTeks ?? [] })))).error)
  }
}

export async function removeTask(id: string) {
  fail((await client().from('tugas').delete().eq('id', id)).error)
}

export async function setTaskAktif(id: string, aktif: boolean) {
  fail((await client().from('tugas').update({ aktif }).eq('id', id)).error)
}

export async function saveBank(item: BankItem) {
  const sb = client()
  const pemilik = await currentUserId()
  if (!pemilik) throw new Error('Sesi berakhir, silakan masuk lagi.')
  const kmap = item.kelas ? await ensureKelas([item.kelas]) : new Map<string, string>()
  const gambar = await gambarSiap(item.gambar, pemilik)
  fail(
    (
      await sb.from('bank_soal').upsert({
        id: item.id,
        pemilik,
        kelas_id: item.kelas ? kmap.get(item.kelas) ?? null : null,
        mapel: item.mapel,
        materi: item.materi,
        tipe: item.tipe,
        teks: item.text,
        opsi: item.options,
        kunci: item.key,
        kiri: item.kiri ?? null,
        kunci_teks: item.kunciTeks ?? [],
        bobot: item.bobot ?? 1,
        gambar_url: gambar,
      })
    ).error,
  )
}

export async function removeBank(id: string) {
  fail((await client().from('bank_soal').delete().eq('id', id)).error)
}

export async function unlockStudent(siswaId: string) {
  fail((await client().rpc('buka_kunci', { p_siswa: siswaId })).error)
}

export async function resetAttempt(percobaanId: string) {
  fail((await client().rpc('reset_ujian', { p_percobaan: percobaanId })).error)
}

/** Pelanggaran siswa pada percobaannya sendiri, sejak terakhir kali guru mereset. */
export async function daftarPelanggaranSaya(percobaanId: string): Promise<Violation[]> {
  const { data, error } = await client().rpc('daftar_pelanggaran_saya', { p_percobaan: percobaanId })
  fail(error)
  return (data ?? []).map((v: Row) => ({ t: ms(v.waktu) ?? 0, type: v.tipe as ViolationType }))
}

/** Ganti sandi guru lewat Supabase Auth: sandi lama diverifikasi dulu dengan masuk ulang. */
export async function gantiSandiGuruRemote(sandiLama: string, sandiBaru: string): Promise<void> {
  const sb = client()
  const { data: me } = await sb.auth.getUser()
  const email = me.user?.email
  if (!email) throw new Error('Sesi berakhir, silakan masuk lagi.')
  const { error: eLama } = await sb.auth.signInWithPassword({ email, password: sandiLama })
  if (eLama) throw new Error('Sandi lama tidak sesuai.')
  const { error: eBaru } = await sb.auth.updateUser({ password: sandiBaru })
  if (eBaru) throw new Error(eBaru.message)
}

/** Tambah, hapus, atau ubah PIN siswa lewat Edge Function (service role di server). */
export async function kelolaSiswa(body: Record<string, unknown>): Promise<Row> {
  const { data, error } = await client().functions.invoke('kelola-siswa', { body })
  if (error) {
    // Pada status non-2xx, isi respons (berisi pesan galat dari fungsi) ada di error.context.
    let detail = error.message
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = await ctx.json()
        detail = j?.error ?? j?.message ?? detail
      } catch {
        /* isi bukan JSON: pakai pesan bawaan */
      }
    }
    throw new Error(`HTTP ${ctx?.status ?? '?'}: ${detail}`)
  }
  if (data?.error) throw new Error(data.error)
  return data ?? {}
}

/* ----------------------------- tulis: mapel ----------------------------- */

/** Menambah nama mapel ke daftar induk guru. Galat duplikat ditangani pemanggil. */
export async function tambahMapel(nama: string) {
  fail((await client().from('mapel').insert({ nama })).error)
}

/** Mengganti nama mapel; soal bank dan penugasan milik guru ikut diperbarui di server (migrasi 0010). */
export async function ubahMapel(lama: string, baru: string) {
  fail((await client().rpc('ubah_mapel', { p_lama: lama, p_baru: baru })).error)
}

/** Menghapus mapel dari daftar; server menolak bila masih dipakai. */
export async function hapusMapel(nama: string) {
  fail((await client().rpc('hapus_mapel', { p_nama: nama })).error)
}

/* ----------------------------- tulis: siswa ----------------------------- */

export async function mulaiUjian(tugasId: string): Promise<string> {
  const { data, error } = await client().rpc('mulai_ujian', { p_tugas: tugasId })
  fail(error)
  return data as string
}

export async function simpanJawaban(percobaanId: string, soalId: string, pilihan: number[], ragu: boolean, teks: string | null = null) {
  fail((await client().rpc('simpan_jawaban', { p_percobaan: percobaanId, p_soal: soalId, p_pilihan: pilihan, p_ragu: ragu, p_teks: teks })).error)
}

export async function catatPelanggaran(percobaanId: string, tipe: ViolationType, catatan?: string): Promise<number> {
  const { data, error } = await client().rpc('catat_pelanggaran', {
    p_percobaan: percobaanId,
    p_tipe: tipe,
    p_catatan: catatan ?? null,
  })
  fail(error)
  return (data as number) ?? 0
}

export async function kirimUjian(percobaanId: string) {
  fail((await client().rpc('kirim_ujian', { p_percobaan: percobaanId })).error)
}
