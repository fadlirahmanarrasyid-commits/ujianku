import { useMemo, useState } from 'react'
import type { Attempt, QType, Question, Student, Task, Violation } from './types'
import {
  correctCount, emptyQuestion, emptyTask, isExpired, jumlahPelanggaranOf, muatPelanggaran, removeTask, resetAttempt, saveBank, saveTask,
  taskAudience, toggleTask, uid, unlockStudent, useDB,
} from './store'
import { parseAiken } from './aiken'
import { bacaBerkasAiken } from './aikenBerkas'
import { pilihGambar } from './lib/gambar'
import { namaBerkasAman, tanggalHariIni, unduhCsv } from './exportCsv'
import { Empty, Icon, Modal, Toggle, VIOLATION_LABEL } from './ui'

const fmtDate = (ms: number) => new Date(ms).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
const pad = (n: number) => String(n).padStart(2, '0')
const toLocalInput = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const kelasOf = (t: Task) => (t.kelas.length ? t.kelas.join(', ') : 'Semua kelas')
const copyOf = (t: Task): Task => ({
  ...JSON.parse(JSON.stringify(t)),
  id: uid('t'),
  judul: `${t.judul} (salinan)`.trim(),
  aktif: false,
  createdAt: Date.now(),
})
const pill = (on: boolean) => ({
  background: on ? 'var(--teal)' : 'var(--card)',
  color: on ? 'var(--on-teal)' : 'var(--ink)',
  border: '1px solid ' + (on ? 'var(--teal)' : 'var(--line)'),
})
const totalBobot = (qs: Question[]) => qs.reduce((n, q) => n + (q.bobot ?? 1), 0)

/* =============================== PENUGASAN (TABEL) =============================== */

export function Tasks({ onResults }: { onResults: (id: string) => void }) {
  const db = useDB()
  const [editing, setEditing] = useState<Task | null>(null)
  const [del, setDel] = useState<Task | null>(null)
  const [q, setQ] = useState('')
  const [kelasF, setKelasF] = useState('')
  const [mapelF, setMapelF] = useState('')

  if (editing) return <TaskEditor initial={editing} onClose={() => setEditing(null)} />

  const kelasList = [...new Set([...db.students.map((x) => x.kelas), ...db.tasks.flatMap((x) => x.kelas)])].filter(Boolean).sort()
  const mapelList = [...new Set(db.tasks.map((x) => x.mapel).filter(Boolean))].sort()
  const rows = db.tasks.filter(
    (t) =>
      (!kelasF || taskAudience(t, kelasF)) &&
      (!mapelF || t.mapel === mapelF) &&
      (t.judul + ' ' + t.mapel + ' ' + kelasOf(t)).toLowerCase().includes(q.toLowerCase()),
  )
  const filtered = !!(q || kelasF || mapelF)
  const iconBtn = 'btn btn-ghost btn-sm px-1.5'
  const statusOf = (t: Task): [string, string] =>
    !t.aktif ? ['Draft', 'chip-gray'] : isExpired(t) ? ['Ditutup', 'chip-red'] : ['Aktif', 'chip-green']
  const aksiButtons = (t: Task) => (
    <div className="flex justify-end flex-wrap gap-0.5">
      <button className={iconBtn} disabled={!t.aktif && t.questions.length === 0} aria-label={t.aktif ? 'Nonaktifkan' : 'Aktifkan'} title={t.aktif ? 'Nonaktifkan' : 'Aktifkan'} onClick={() => toggleTask(t.id)}>
        <Icon n={t.aktif ? 'x' : 'play'} s={14} />
      </button>
      <button className={iconBtn} aria-label="Edit" title="Edit" onClick={() => setEditing(JSON.parse(JSON.stringify(t)))}><Icon n="edit" s={14} /></button>
      <button className={iconBtn} aria-label="Salin untuk kelas lain" title="Salin untuk kelas lain" onClick={() => setEditing(copyOf(t))}><Icon n="copy" s={14} /></button>
      <button className={iconBtn} aria-label="Lihat hasil" title="Hasil & reset" onClick={() => onResults(t.id)}><Icon n="chart" s={14} /></button>
      <button className="btn btn-danger btn-sm px-1.5" aria-label="Hapus" title="Hapus" onClick={() => setDel(t)}><Icon n="trash" s={14} /></button>
    </div>
  )

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display text-2xl font-bold">Penugasan</h1>
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Buat tugas ujian, atur kelas, batas akhir, dan jenis soal.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input" style={{ maxWidth: 220 }} placeholder="Cari judul atau mapel…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari penugasan" />
          <select className="input" style={{ maxWidth: 160 }} value={kelasF} onChange={(e) => setKelasF(e.target.value)} aria-label="Filter kelas">
            <option value="">Semua kelas</option>
            {kelasList.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <select className="input" style={{ maxWidth: 200 }} value={mapelF} onChange={(e) => setMapelF(e.target.value)} aria-label="Filter mapel">
            <option value="">Semua mapel</option>
            {mapelList.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {filtered && (
            <button className="btn btn-ghost" onClick={() => { setQ(''); setKelasF(''); setMapelF('') }}>Reset filter</button>
          )}
          <button className="btn btn-primary" onClick={() => setEditing(emptyTask())}><Icon n="plus" /> Buat penugasan</button>
        </div>
      </div>

      {/* Tampilan ponsel: kartu per penugasan */}
      <div className="md:hidden space-y-3">
        {rows.length === 0 ? (
          <div className="card"><Empty icon="task" title={filtered ? "Tidak ada penugasan yang cocok" : "Belum ada penugasan"} hint={filtered ? "Ubah pencarian atau filter kelas dan mapel." : "Buat tugas pertama Anda."} /></div>
        ) : rows.map((t) => {
          const peserta = db.attempts.filter((a) => a.taskId === t.id).length
          const [label, cls] = statusOf(t)
          return (
            <div key={t.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold break-words min-w-0">{t.judul || 'Tanpa judul'}</div>
                <span className={`chip shrink-0 ${cls}`}>{label}</span>
              </div>
              <div className="text-xs mt-1 break-words" style={{ color: 'var(--ink-soft)' }}>{t.mapel || '–'} · {kelasOf(t)}</div>
              <div className="grid grid-cols-4 gap-2 mt-3 text-sm">
                <div><div className="label">Soal</div><div className="tabular-nums">{t.questions.length}</div></div>
                <div><div className="label">Waktu</div><div className="tabular-nums">{t.durasi} mnt</div></div>
                <div><div className="label">KKM</div><div className="tabular-nums">{t.kkm}</div></div>
                <div><div className="label">Peserta</div><div className="tabular-nums">{peserta}</div></div>
              </div>
              <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--line)' }}>{aksiButtons(t)}</div>
            </div>
          )
        })}
      </div>

      {/* Tampilan layar sedang ke atas: tabel */}
      <div className="card overflow-hidden hidden md:block">
        {rows.length === 0 ? (
          <Empty icon="task" title={filtered ? "Tidak ada penugasan yang cocok" : "Belum ada penugasan"} hint={filtered ? "Ubah pencarian atau filter kelas dan mapel." : "Buat tugas pertama Anda."} />
        ) : (
          <table className="w-full text-sm" style={{ tableLayout: 'fixed', minWidth: 560 }}>
            <thead>
              <tr>
                <th className="th" style={{ width: '22%' }}>Judul materi</th>
                <th className="th" style={{ width: '14%' }}>Mapel · Kelas</th>
                <th className="th" style={{ width: '13%' }}>Soal</th>
                <th className="th" style={{ width: '9%' }}>Waktu · KKM</th>
                <th className="th hidden lg:table-cell" style={{ width: '12%' }}>Batas akhir</th>
                <th className="th hidden md:table-cell" style={{ width: '6%' }}>Peserta</th>
                <th className="th" style={{ width: '7%' }}>Status</th>
                <th className="th text-right" style={{ width: '17%' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const peserta = db.attempts.filter((a) => a.taskId === t.id).length
                const count = (k: QType) => t.questions.filter((x) => x.tipe === k).length
                const [label, cls] = statusOf(t)
                return (
                  <tr key={t.id}>
                    <td className="td font-semibold break-words">{t.judul || 'Tanpa judul'}</td>
                    <td className="td break-words">
                      <div>{t.mapel || '–'}</div>
                      <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{kelasOf(t)}</div>
                    </td>
                    <td className="td">
                      <div className="tabular-nums">{t.questions.length} soal</div>
                      <div className="text-[11px] break-words" style={{ color: 'var(--ink-soft)' }}>{totalBobot(t.questions)} poin · PG {count('pg')} · PGK {count('pgk')} · B/S {count('bs')}</div>
                    </td>
                    <td className="td tabular-nums">
                      {t.durasi} mnt
                      <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>KKM {t.kkm}</div>
                    </td>
                    <td className="td hidden lg:table-cell text-xs break-words">{t.batasAkhir ? fmtDate(t.batasAkhir) : 'Tanpa batas'}</td>
                    <td className="td hidden md:table-cell tabular-nums">{peserta}</td>
                    <td className="td"><span className={`chip ${cls}`}>{label}</span></td>
                    <td className="td">{aksiButtons(t)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!del} onClose={() => setDel(null)} title="Hapus penugasan?">
        <p className="text-sm">“{del?.judul}” beserta seluruh hasil siswa akan dihapus permanen.</p>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn btn-ghost" onClick={() => setDel(null)}>Batal</button>
          <button className="btn btn-amber" style={{ background: 'var(--red)' }} onClick={() => { removeTask(del!.id); setDel(null) }}>Hapus</button>
        </div>
      </Modal>
    </section>
  )
}

/* ================================ EDITOR ================================ */

function TaskEditor({ initial, onClose }: { initial: Task; onClose: () => void }) {
  const db = useDB()
  const [t, setT] = useState<Task>(initial)
  const [errors, setErrors] = useState<string[]>([])
  const [imp, setImp] = useState(false)
  const [bank, setBank] = useState(false)
  const [bankMsg, setBankMsg] = useState('')
  const isNew = !db.tasks.some((x) => x.id === t.id)
  const kelasList = useMemo(
    () => [...new Set([...db.students.map((s) => s.kelas), ...db.tasks.flatMap((x) => x.kelas)])].sort(),
    [db.students, db.tasks],
  )

  const set = <K extends keyof Task>(k: K, v: Task[K]) => setT((p) => ({ ...p, [k]: v }))
  const setQ = (i: number, nq: Question) => set('questions', t.questions.map((q, j) => (j === i ? nq : q)))
  const toggleKelas = (k: string) => set('kelas', t.kelas.includes(k) ? t.kelas.filter((x) => x !== k) : [...t.kelas, k])
  const addQuestions = (qs: Question[]) =>
    set('questions', t.questions.length === 1 && !t.questions[0].text.trim() ? qs : [...t.questions, ...qs])
  const counts = (k: QType) => t.questions.filter((x) => x.tipe === k).length

  const validate = () => {
    const e: string[] = []
    if (!t.judul.trim()) e.push('Judul materi wajib diisi.')
    if (!t.mapel.trim()) e.push('Mata pelajaran wajib diisi.')
    if (t.durasi < 1) e.push('Waktu minimal 1 menit.')
    if (t.questions.length === 0) e.push('Tambahkan minimal 1 soal.')
    t.questions.forEach((q, i) => {
      const n = i + 1
      if (!q.text.trim()) e.push(`Soal ${n}: teks soal masih kosong.`)
      if (q.options.some((o) => !o.trim())) e.push(`Soal ${n}: ada opsi jawaban yang kosong.`)
      if (q.key.length === 0) e.push(`Soal ${n}: kunci jawaban belum ditandai.`)
    })
    return e
  }
  const save = (aktif?: boolean) => {
    const e = validate()
    setErrors(e)
    if (e.length) return window.scrollTo({ top: 0, behavior: 'smooth' })
    saveTask({ ...t, aktif: aktif ?? t.aktif })
    onClose()
  }

  return (
    <section>
      <button className="btn btn-ghost btn-sm mb-4" onClick={onClose}><Icon n="left" s={14} /> Kembali</button>
      <h1 className="font-display text-2xl font-bold mb-5">{isNew ? 'Buat penugasan' : 'Edit penugasan'}</h1>

      {errors.length > 0 && (
        <div className="rounded-lg px-4 py-3 mb-5 text-sm" style={{ background: 'var(--red-tint)', color: 'var(--red)' }} role="alert">
          <div className="font-bold mb-1">Periksa kembali:</div>
          <ul className="list-disc pl-5 space-y-0.5">
            {errors.slice(0, 6).map((x) => <li key={x}>{x}</li>)}
            {errors.length > 6 && <li>…dan {errors.length - 6} lainnya</li>}
          </ul>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          <div className="card p-5">
            <h2 className="font-display font-bold text-lg mb-4">1 · Informasi tugas</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="jd">Judul materi</label>
                <input id="jd" className="input" value={t.judul} onChange={(e) => set('judul', e.target.value)} placeholder="mis. Sistem Pendingin Mesin" />
              </div>
              <div>
                <label className="label" htmlFor="mp">Mata pelajaran</label>
                <input id="mp" className="input" value={t.mapel} onChange={(e) => set('mapel', e.target.value)} placeholder="mis. Pemeliharaan Mesin" />
              </div>
              <div>
                <label className="label" htmlFor="bk">Batas akhir ujian</label>
                <input
                  id="bk"
                  type="datetime-local"
                  className="input"
                  value={t.batasAkhir ? toLocalInput(t.batasAkhir) : ''}
                  onChange={(e) => set('batasAkhir', e.target.value ? new Date(e.target.value).getTime() : null)}
                />
                {t.batasAkhir && <button className="btn btn-ghost btn-sm mt-2" onClick={() => set('batasAkhir', null)}>Hapus batas</button>}
              </div>
              <div className="sm:col-span-2">
                <span className="label">Untuk kelas (bisa lebih dari satu)</span>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" aria-pressed={t.kelas.length === 0} onClick={() => set('kelas', [])} className="rounded-full px-3 py-1 text-xs font-bold" style={pill(t.kelas.length === 0)}>Semua kelas</button>
                  {kelasList.map((k) => (
                    <button key={k} type="button" aria-pressed={t.kelas.includes(k)} onClick={() => toggleKelas(k)} className="rounded-full px-3 py-1 text-xs font-bold" style={pill(t.kelas.includes(k))}>{k}</button>
                  ))}
                </div>
                <p className="text-xs mt-2" style={{ color: 'var(--ink-soft)' }}>Soal yang sama dipakai untuk semua kelas yang dipilih. “Salin untuk kelas lain” di tabel membuat versi terpisah.</p>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="font-display font-bold text-lg">
                2 · Soal <span className="text-sm font-sans font-semibold" style={{ color: 'var(--ink-soft)' }}>({t.questions.length} soal · PG {counts('pg')} · PGK {counts('pgk')} · B/S {counts('bs')} · total {totalBobot(t.questions)} poin)</span>
              </h2>
              <div className="flex gap-2">
                <button className="btn btn-ghost btn-sm" onClick={() => setBank(true)}><Icon n="book" s={14} /> Ambil dari bank</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setImp(true)}><Icon n="upload" s={14} /> Impor AIKEN</button>
              </div>
            </div>
            {bankMsg && <p className="text-xs mb-3" style={{ color: 'var(--green)' }}>{bankMsg}</p>}

            <div className="space-y-4">
              {t.questions.map((q, i) => (
                <QuestionCard
                  key={q.id}
                  q={q}
                  label={`Soal ${i + 1}`}
                  onChange={(nq) => setQ(i, nq)}
                  onCopy={() => set('questions', [...t.questions.slice(0, i + 1), { ...q, id: uid('q'), options: [...q.options], key: [...q.key] }, ...t.questions.slice(i + 1)])}
                  onRemove={() => set('questions', t.questions.filter((_, j) => j !== i))}
                  removable={t.questions.length > 1}
                  onSaveBank={() => {
                    saveBank({ ...q, id: uid('b'), mapel: t.mapel.trim() || 'Umum', materi: t.judul.trim() || 'Umum', kelas: t.kelas.join(', ') })
                    setBankMsg(`Soal ${i + 1} disimpan ke bank soal.`)
                  }}
                />
              ))}
            </div>
            <button className="btn btn-ghost w-full mt-4" onClick={() => set('questions', [...t.questions, emptyQuestion('pg')])}><Icon n="plus" /> Tambah soal</button>
          </div>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-20">
          <div className="card p-5">
            <h2 className="font-display font-bold text-lg mb-3">3 · Pengaturan</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="du">Waktu (menit)</label>
                <input id="du" type="number" min={1} className="input" value={t.durasi} onChange={(e) => set('durasi', Math.max(0, +e.target.value))} />
              </div>
              <div>
                <label className="label" htmlFor="kk">KKM</label>
                <input id="kk" type="number" min={0} max={100} className="input" value={t.kkm} onChange={(e) => set('kkm', Math.min(100, Math.max(0, +e.target.value)))} />
              </div>
            </div>
            <div className="mt-3 divide-y" style={{ borderColor: 'var(--line)' }}>
              <Toggle on={t.acakSoal} onChange={(v) => set('acakSoal', v)} label="Acak urutan soal" hint="Setiap siswa mendapat urutan berbeda." />
              <Toggle on={t.acakOpsi} onChange={(v) => set('acakOpsi', v)} label="Acak opsi jawaban" hint="Huruf A–E tiap siswa berbeda." />
              <Toggle on={t.tampilNilai} onChange={(v) => set('tampilNilai', v)} label="Tampilkan nilai ke siswa" />
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-display font-bold text-lg mb-1 flex items-center gap-2"><Icon n="shield" s={18} /> Anti curang</h2>
            <div className="divide-y">
              <Toggle on={t.wajibFullscreen} onChange={(v) => set('wajibFullscreen', v)} label="Wajib layar penuh" hint="Keluar layar penuh dihitung pelanggaran." />
              <Toggle on={t.kunciMaju} onChange={(v) => set('kunciMaju', v)} label="Hanya maju" hint="Siswa tidak bisa kembali ke soal sebelumnya." />
            </div>
            <div className="mt-2">
              <label className="label" htmlFor="mx">Kunci otomatis setelah</label>
              <div className="flex items-center gap-2">
                <input id="mx" type="number" min={1} max={10} className="input" style={{ width: 80 }} value={t.maxPelanggaran} onChange={(e) => set('maxPelanggaran', Math.min(10, Math.max(1, +e.target.value)))} />
                <span className="text-sm">pelanggaran</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button className="btn btn-ghost flex-1" onClick={() => save(false)}>Simpan draft</button>
            <button className="btn btn-primary flex-1" onClick={() => save(true)}>Simpan & aktifkan</button>
          </div>
        </aside>
      </div>

      <AikenImport open={imp} onClose={() => setImp(false)} onAdd={(qs) => { addQuestions(qs); setImp(false) }} />
      <BankPicker
        open={bank}
        onClose={() => setBank(false)}
        defaultMapel={t.mapel}
        onPick={(qs) => { addQuestions(qs); setBankMsg(`${qs.length} soal dari bank soal ditambahkan.`); setBank(false) }}
      />
    </section>
  )
}

/* ============================ KARTU SOAL (dipakai ulang) ============================ */

export function QuestionCard({
  q, label, onChange, onRemove, onCopy, onSaveBank, removable = true,
}: {
  q: Question
  label: string
  onChange: (q: Question) => void
  onRemove?: () => void
  onCopy?: () => void
  onSaveBank?: () => void
  removable?: boolean
}) {
  const upd = (fn: (x: Question) => Question) => onChange(fn(q))
  const [gErr, setGErr] = useState<string | null>(null)
  const unggah = async (f: File) => {
    setGErr(null)
    try {
      const data = await pilihGambar(f)
      upd((x) => ({ ...x, gambar: data }))
    } catch (e) {
      setGErr(e instanceof Error ? e.message : 'Gagal memuat gambar.')
    }
  }
  const changeTipe = (tipe: QType) =>
    upd((x) => ({
      ...x,
      tipe,
      options: tipe === 'bs' ? ['Benar', 'Salah'] : x.tipe === 'bs' ? ['', '', '', ''] : x.options,
      key: tipe === 'bs' ? [0] : tipe === 'pg' ? [x.key[0] ?? 0] : x.key.length ? x.key : [0],
    }))
  const toggleKey = (k: number) =>
    upd((x) => {
      if (x.tipe !== 'pgk') return { ...x, key: [k] }
      const key = x.key.includes(k) ? x.key.filter((y) => y !== k) : [...x.key, k].sort((a, b) => a - b)
      return { ...x, key }
    })
  const removeOpt = (k: number) =>
    upd((x) => {
      const key = x.key.filter((y) => y !== k).map((y) => (y > k ? y - 1 : y))
      return { ...x, options: x.options.filter((_, z) => z !== k), key: key.length ? key : [0] }
    })

  return (
    <div className="rounded-lg border p-4" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip chip-teal">{label}</span>
          <select className="input" style={{ width: 'auto', padding: '.3rem .5rem' }} value={q.tipe} onChange={(e) => changeTipe(e.target.value as QType)} aria-label={`Tipe ${label}`}>
            <option value="pg">Pilihan ganda (2–5 opsi)</option>
            <option value="pgk">Pilihan ganda kompleks</option>
            <option value="bs">Benar / Salah</option>
          </select>
          <label className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--ink-soft)' }}>
            Bobot
            <input
              type="number"
              min={1}
              max={10}
              className="input"
              style={{ width: 64, padding: '.3rem .5rem' }}
              value={q.bobot ?? 1}
              onChange={(e) => upd((x) => ({ ...x, bobot: Math.min(10, Math.max(1, +e.target.value || 1)) }))}
              aria-label={`Bobot ${label}`}
            />
            poin
          </label>
        </div>
        <div className="flex gap-1">
          {onSaveBank && <button className="btn btn-ghost btn-sm" title="Simpan ke bank soal" aria-label="Simpan ke bank soal" onClick={onSaveBank}><Icon n="book" s={14} /></button>}
          {onCopy && <button className="btn btn-ghost btn-sm" aria-label="Gandakan soal" onClick={onCopy}><Icon n="copy" s={14} /></button>}
          {onRemove && <button className="btn btn-danger btn-sm" aria-label="Hapus soal" disabled={!removable} onClick={onRemove}><Icon n="trash" s={14} /></button>}
        </div>
      </div>

      <textarea className="input" rows={2} value={q.text} onChange={(e) => upd((x) => ({ ...x, text: e.target.value }))} placeholder="Tulis pertanyaan…" aria-label={`Teks ${label}`} />

      <div className="mt-3 flex flex-wrap items-start gap-3">
        {q.gambar ? (
          <>
            <img src={q.gambar} alt={`Gambar ${label}`} className="rounded-md border max-h-48 max-w-full w-auto" style={{ borderColor: 'var(--line)' }} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setGErr(null); upd((x) => ({ ...x, gambar: undefined })) }}>
              <Icon n="trash" s={13} /> Hapus gambar
            </button>
          </>
        ) : (
          <label className="btn btn-ghost btn-sm cursor-pointer">
            <Icon n="upload" s={13} /> Tambah gambar
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label={`Gambar ${label}`}
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void unggah(f)
              }}
            />
          </label>
        )}
        {gErr && <p className="text-xs w-full" style={{ color: 'var(--red)' }}>{gErr}</p>}
      </div>

      <div className="mt-3 space-y-2">
        {q.options.map((o, k) => (
          <div key={k} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleKey(k)}
              aria-label={`Tandai opsi ${String.fromCharCode(65 + k)} sebagai kunci`}
              aria-pressed={q.key.includes(k)}
              className="shrink-0 grid place-items-center rounded-full font-bold text-xs"
              style={{ width: 30, height: 30, border: '2px solid ' + (q.key.includes(k) ? 'var(--green)' : 'var(--line)'), background: q.key.includes(k) ? 'var(--green)' : 'var(--card)', color: q.key.includes(k) ? 'var(--on-teal)' : 'var(--ink-soft)' }}
            >
              {q.key.includes(k) ? <Icon n="check" s={14} /> : String.fromCharCode(65 + k)}
            </button>
            <input
              className="input"
              value={o}
              disabled={q.tipe === 'bs'}
              onChange={(e) => upd((x) => ({ ...x, options: x.options.map((y, z) => (z === k ? e.target.value : y)) }))}
              placeholder={`Opsi ${String.fromCharCode(65 + k)}`}
              aria-label={`Opsi ${String.fromCharCode(65 + k)} ${label}`}
            />
            {q.tipe !== 'bs' && q.options.length > 2 && (
              <button className="btn btn-ghost btn-sm" aria-label="Hapus opsi" onClick={() => removeOpt(k)}><Icon n="x" s={13} /></button>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
        <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>
          {q.tipe === 'pgk' ? 'Tandai SEMUA jawaban yang benar.' : 'Tandai satu jawaban yang benar.'}
        </span>
        {q.tipe !== 'bs' && q.options.length < 5 && (
          <button className="btn btn-ghost btn-sm" onClick={() => upd((x) => ({ ...x, options: [...x.options, ''] }))}><Icon n="plus" s={13} /> Opsi</button>
        )}
      </div>
    </div>
  )
}

function BankPicker({ open, onClose, defaultMapel, onPick }: { open: boolean; onClose: () => void; defaultMapel: string; onPick: (qs: Question[]) => void }) {
  const db = useDB()
  const [mapel, setMapel] = useState('')
  const [dipilih, setDipilih] = useState<Set<string>>(new Set())
  const mapelList = [...new Set(db.bank.map((b) => b.mapel))].sort()
  const rows = db.bank.filter((b) => !mapel || b.mapel === mapel)
  const semuaTerpilih = rows.length > 0 && rows.every((b) => dipilih.has(b.id))
  const toggle = (id: string) => setDipilih((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const pilihSemua = () => setDipilih((prev) => {
    const next = new Set(prev)
    if (semuaTerpilih) rows.forEach((b) => next.delete(b.id))
    else rows.forEach((b) => next.add(b.id))
    return next
  })
  const tambahkan = () => {
    const pilihan = db.bank.filter((b) => dipilih.has(b.id))
    // Salinan soal: mapel, kelas, dan materi bank tidak ikut ke penugasan. ID baru agar tidak bentrok.
    onPick(pilihan.map(({ mapel: _m, kelas: _k, materi: _x, ...rest }) => ({ ...rest, id: uid('q') })))
    setDipilih(new Set())
  }
  const tutup = () => { setDipilih(new Set()); onClose() }
  return (
    <Modal open={open} onClose={tutup} title="Ambil soal dari bank" wide>
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <div>
          <label className="label" htmlFor="bp">Mapel</label>
          <select id="bp" className="input" style={{ minWidth: 220 }} value={mapel} onChange={(e) => setMapel(e.target.value)}>
            <option value="">Semua mapel</option>
            {mapelList.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
        {defaultMapel && <button className="btn btn-ghost btn-sm" onClick={() => setMapel(defaultMapel)}>Pakai mapel tugas ini</button>}
      </div>
      {rows.length === 0 ? (
        <Empty icon="book" title="Bank soal kosong" hint="Simpan soal dari editor penugasan atau tambahkan dari menu Bank soal." />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-sm">
            <button className="btn btn-ghost btn-sm" onClick={pilihSemua}>{semuaTerpilih ? 'Batal pilih semua' : `Pilih semua ${rows.length} soal yang tampil`}</button>
            <span style={{ color: 'var(--ink-soft)' }}>{dipilih.size} soal dipilih</span>
          </div>
          <ul className="space-y-2 max-h-[52vh] overflow-auto pr-1">
            {rows.map((b) => (
              <li key={b.id}>
                <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer" style={{ borderColor: dipilih.has(b.id) ? 'var(--teal)' : 'var(--line)' }}>
                  <input type="checkbox" className="mt-1 shrink-0" checked={dipilih.has(b.id)} onChange={() => toggle(b.id)} aria-label={`Pilih soal: ${b.text.slice(0, 40)}`} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-1.5 mb-1">
                      <span className="chip chip-gray">{b.kelas || 'Umum'}</span>
                      <span className="chip chip-teal">{b.mapel}</span>
                      {b.materi && <span className="chip chip-gray">{b.materi}</span>}
                      <span className="chip chip-gray">{b.tipe === 'pg' ? 'PG' : b.tipe === 'pgk' ? 'PGK' : 'B/S'} · {b.bobot ?? 1} poin</span>
                    </div>
                    <p className="text-sm break-words">{b.text}</p>
                  </div>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn btn-ghost" onClick={tutup}>Batal</button>
        <button className="btn btn-primary" disabled={dipilih.size === 0} onClick={tambahkan}><Icon n="plus" s={13} /> Tambahkan {dipilih.size} soal</button>
      </div>
    </Modal>
  )
}

function AikenImport({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (qs: Question[]) => void }) {
  const [txt, setTxt] = useState('')
  const [berkasErr, setBerkasErr] = useState('')
  const res = useMemo(() => (txt.trim() ? parseAiken(txt) : null), [txt])
  const pilihBerkas = async (f: File | undefined) => {
    if (!f) return
    try {
      setTxt(await bacaBerkasAiken(f))
      setBerkasErr('')
    } catch (e) {
      setBerkasErr(e instanceof Error ? e.message : 'Gagal membaca berkas.')
    }
  }
  return (
    <Modal open={open} onClose={() => { setTxt(''); setBerkasErr(''); onClose() }} title="Impor soal format AIKEN" wide>
      <pre className="text-xs rounded-lg p-3 mb-3 overflow-x-auto" style={{ background: 'var(--tint-2)' }}>{`Apa ibukota Indonesia?
A. Bandung
B. Jakarta
C. Surabaya
D. Medan
ANSWER: B`}</pre>
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <label className="btn btn-ghost btn-sm cursor-pointer">
          <Icon n="upload" s={14} /> Pilih berkas .txt
          <input type="file" accept=".txt,.aiken,text/plain" className="sr-only" onChange={(e) => { void pilihBerkas(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>atau tempel teks di bawah</span>
      </div>
      {berkasErr && <p className="text-sm mb-2" style={{ color: 'var(--red)' }} role="alert">{berkasErr}</p>}
      <textarea className="input font-mono" rows={8} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Tempel soal format AIKEN di sini…" aria-label="Teks AIKEN" />
      {res && (
        <div className="mt-3 text-sm">
          <p className="font-semibold" style={{ color: res.questions.length ? 'var(--green)' : 'var(--ink-soft)' }}>
            {res.questions.length} soal terbaca
            {res.questions.length > 0 && ` · PG ${res.questions.filter((q) => q.tipe === 'pg').length} · PGK ${res.questions.filter((q) => q.tipe === 'pgk').length} · B/S ${res.questions.filter((q) => q.tipe === 'bs').length}`}
          </p>
          {res.errors.length > 0 && (
            <ul className="list-disc pl-5 mt-2 space-y-0.5" style={{ color: 'var(--red)' }}>
              {res.errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn btn-ghost" onClick={() => { setTxt(''); setBerkasErr(''); onClose() }}>Batal</button>
        <button className="btn btn-primary" disabled={!res || res.questions.length === 0} onClick={() => { onAdd(res!.questions); setTxt(''); setBerkasErr('') }}>
          Tambahkan {res?.questions.length ?? 0} soal
        </button>
      </div>
    </Modal>
  )
}

/* ============================== HASIL & RESET (TABEL) ============================== */

export function Results({ taskId, setTaskId }: { taskId: string; setTaskId: (id: string) => void }) {
  const db = useDB()
  const task = db.tasks.find((t) => t.id === taskId) ?? db.tasks[0]
  const [reset, setReset] = useState<{ a: Attempt; s: Student } | null>(null)
  const [log, setLog] = useState<{ a: Attempt; s: Student } | null>(null)
  const [logList, setLogList] = useState<Violation[]>([])
  const [logMuat, setLogMuat] = useState(false)
  const bukaLog = async (a: Attempt, s: Student) => {
    setLog({ a, s })
    setLogList([])
    setLogMuat(true)
    try {
      setLogList(await muatPelanggaran(a))
    } catch {
      setLogList(a.violations)
    } finally {
      setLogMuat(false)
    }
  }
  const [kelasF, setKelasF] = useState('')
  const [statusF, setStatusF] = useState('')

  if (!task) return <div className="card"><Empty icon="chart" title="Belum ada penugasan" hint="Buat penugasan terlebih dahulu untuk melihat hasilnya." /></div>

  const all = db.students
    .filter((s) => taskAudience(task, s.kelas))
    .map((s) => ({ s, a: db.attempts.find((x) => x.taskId === task.id && x.studentId === s.id) }))
  const belowKkm = (a?: Attempt) => a?.status === 'selesai' && (a.score ?? 0) < task.kkm
  const done = all.filter((r) => r.a?.status === 'selesai')
  const avg = done.length ? Math.round(done.reduce((n, r) => n + (r.a!.score ?? 0), 0) / done.length) : null
  const below = done.filter((r) => belowKkm(r.a)).length
  const locked = all.filter((r) => r.a?.status === 'terkunci' || r.s.locked).length
  const kelasOpts = [...new Set(all.map((r) => r.s.kelas))].sort()

  const rows = all
    .filter((r) => !kelasF || r.s.kelas === kelasF)
    .filter((r) => {
      if (!statusF) return true
      if (statusF === 'below') return belowKkm(r.a)
      if (statusF === 'locked') return r.a?.status === 'terkunci' || r.s.locked
      if (statusF === 'belum') return !r.a
      return r.a?.status === statusF
    })

  const eksporNilai = () => {
    const header = ['No', 'Nama', 'NIS', 'Kelas', 'Status', 'Nilai', 'KKM', 'Ketuntasan', 'Benar', 'Jumlah soal', 'Pelanggaran']
    const body = rows.map(({ s, a }, i) => {
      const isLocked = a?.status === 'terkunci' || s.locked
      const status = !a
        ? (s.locked ? 'Login terkunci' : 'Belum mulai')
        : a.status === 'selesai' ? 'Selesai'
        : a.status === 'berjalan' ? 'Mengerjakan'
        : 'Ujian terkunci'
      const selesai = a?.status === 'selesai'
      const nilai = a?.score ?? 0
      return [
        i + 1,
        s.nama,
        s.nis,
        s.kelas,
        isLocked && a?.status !== 'terkunci' && a ? `${status} · Login terkunci` : status,
        selesai ? nilai : '',
        task.kkm,
        selesai ? (nilai >= task.kkm ? 'Tuntas' : 'Belum tuntas') : '',
        a ? correctCount(task, a) : '',
        task.questions.length,
        a ? jumlahPelanggaranOf(a) : 0,
      ]
    })
    unduhCsv(`nilai-${namaBerkasAman(task.judul || 'penugasan')}-${tanggalHariIni()}.csv`, header, body)
  }

  const stats: [string, string | number, string][] = [
    ['Selesai', `${done.length}/${all.length}`, 'var(--teal)'],
    ['Rata-rata', avg ?? '–', 'var(--ink)'],
    ['Di bawah KKM', below, below ? 'var(--red)' : 'var(--ink)'],
    ['Terkunci', locked, locked ? 'var(--amber)' : 'var(--ink)'],
  ]

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display text-2xl font-bold">Hasil & Reset</h1>
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Reset ujian siswa yang di bawah KKM atau buka kunci akun yang terkunci.</p>
        </div>
        <div className="min-w-[240px]">
          <label className="label" htmlFor="pt">Penugasan</label>
          <select id="pt" className="input" value={task.id} onChange={(e) => setTaskId(e.target.value)}>
            {db.tasks.map((t) => <option key={t.id} value={t.id}>{t.judul || 'Tanpa judul'} · {kelasOf(t)}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {stats.map(([l, v, c]) => (
          <div key={l} className="card px-4 py-3">
            <div className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>{l}</div>
            <div className="font-display text-3xl font-bold mt-1 leading-none" style={{ color: c }}>{v}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="flex flex-wrap gap-2 p-3 border-b" style={{ borderColor: 'var(--line)' }}>
          <select className="input" style={{ maxWidth: 180 }} value={kelasF} onChange={(e) => setKelasF(e.target.value)} aria-label="Filter kelas">
            <option value="">Semua kelas</option>
            {kelasOpts.map((k) => <option key={k}>{k}</option>)}
          </select>
          <select className="input" style={{ maxWidth: 200 }} value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="Filter status">
            <option value="">Semua status</option>
            <option value="selesai">Selesai</option>
            <option value="below">Di bawah KKM</option>
            <option value="berjalan">Sedang mengerjakan</option>
            <option value="locked">Terkunci</option>
            <option value="belum">Belum mulai</option>
          </select>
          <button className="btn btn-ghost ml-auto" onClick={eksporNilai} disabled={rows.length === 0} title="Unduh nilai siswa yang tampil sebagai CSV (bisa dibuka di Excel)">
            <Icon n="upload" s={14} /> Ekspor nilai (CSV)
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr>{['Siswa', 'Kelas', 'Status', 'Nilai', 'Benar', 'Pelanggaran', 'Aksi'].map((c) => <th key={c} className="th">{c}</th>)}</tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td className="td" colSpan={7}><Empty icon="users" title="Tidak ada data" hint="Ubah filter atau pilih penugasan lain." /></td></tr>}
              {rows.map(({ s, a }) => {
                const isLocked = a?.status === 'terkunci' || s.locked
                return (
                  <tr key={s.id}>
                    <td className="td"><div className="font-semibold">{s.nama}</div><div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{s.nis}</div></td>
                    <td className="td">{s.kelas}</td>
                    <td className="td">
                      {!a && !s.locked && <span className="chip chip-gray">Belum mulai</span>}
                      {a?.status === 'berjalan' && <span className="chip chip-teal">Mengerjakan</span>}
                      {a?.status === 'selesai' && <span className="chip chip-green">Selesai</span>}
                      {isLocked && <span className="chip chip-red"><Icon n="lock" s={11} /> {a?.status === 'terkunci' ? 'Ujian terkunci' : 'Login terkunci'}</span>}
                    </td>
                    <td className="td">
                      {a?.status === 'selesai' ? (
                        <span className="font-display text-xl font-bold" style={{ color: belowKkm(a) ? 'var(--red)' : 'var(--green)' }}>{a.score}</span>
                      ) : <span style={{ color: 'var(--ink-soft)' }}>–</span>}
                      {belowKkm(a) && <span className="chip chip-red ml-2">&lt; KKM {task.kkm}</span>}
                    </td>
                    <td className="td tabular-nums">{a ? `${correctCount(task, a)}/${task.questions.length}` : '–'}</td>
                    <td className="td">
                      {a && jumlahPelanggaranOf(a) > 0 ? (
                        <button className="chip chip-amber cursor-pointer" onClick={() => bukaLog(a, s)}><Icon n="alert" s={11} /> {jumlahPelanggaranOf(a)} · lihat</button>
                      ) : <span style={{ color: 'var(--ink-soft)' }}>0</span>}
                    </td>
                    <td className="td">
                      <div className="flex gap-1.5 whitespace-nowrap">
                        {isLocked && <button className="btn btn-amber btn-sm" onClick={() => unlockStudent(s.id)}><Icon n="unlock" s={13} /> Buka kunci</button>}
                        {a && (belowKkm(a) || a.status === 'terkunci') && <button className="btn btn-danger btn-sm" onClick={() => setReset({ a, s })}><Icon n="refresh" s={13} /> Reset</button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={!!reset} onClose={() => setReset(null)} title="Reset ujian siswa?">
        <p className="text-sm">Jawaban dan nilai <b>{reset?.s.nama}</b> pada “{task.judul}” dihapus. Siswa dapat mengerjakan ulang dengan soal teracak baru, dan akunnya dibuka kuncinya.</p>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn btn-ghost" onClick={() => setReset(null)}>Batal</button>
          <button className="btn btn-primary" onClick={() => { resetAttempt(reset!.a.id); setReset(null) }}>Ya, reset</button>
        </div>
      </Modal>

      <Modal open={!!log} onClose={() => setLog(null)} title={`Catatan pelanggaran · ${log?.s.nama ?? ''}`}>
        {logMuat && <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Memuat catatan…</p>}
        <ul className="space-y-2">
          {!logMuat && logList.map((v, i) => (
            <li key={i} className="flex items-center justify-between text-sm rounded-lg px-3 py-2" style={{ background: 'var(--amber-tint)' }}>
              <span className="font-semibold">{VIOLATION_LABEL[v.type] ?? v.type}{v.note ? ` (${v.note})` : ''}</span>
              <span className="tabular-nums text-xs" style={{ color: 'var(--ink-soft)' }}>{new Date(v.t).toLocaleTimeString('id-ID')}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </section>
  )
}

/* ============================ REKAP CETAK (SATU TABEL) ============================ */

export function Recap() {
  const db = useDB()
  const [kelas, setKelas] = useState('')
  const [mapel, setMapel] = useState('')
  const [msg, setMsg] = useState('')

  const mapelList = [...new Set(db.tasks.map((t) => t.mapel).filter(Boolean))].sort()
  const kelasList = [...new Set(db.students.map((s) => s.kelas))].sort()

  const tasks = db.tasks
    .filter((t) => !mapel || t.mapel === mapel)
    .sort((x, y) => x.mapel.localeCompare(y.mapel) || x.createdAt - y.createdAt)
  const groups: { mapel: string; tasks: Task[] }[] = []
  for (const t of tasks) {
    let g = groups.find((x) => x.mapel === t.mapel)
    if (!g) {
      g = { mapel: t.mapel, tasks: [] }
      groups.push(g)
    }
    g.tasks.push(t)
  }

  const findA = (t: Task, s: Student) => db.attempts.find((a) => a.taskId === t.id && a.studentId === s.id)
  const students = db.students
    .filter((s) => (!kelas || s.kelas === kelas) && tasks.some((t) => findA(t, s)))
    .sort((x, y) => x.kelas.localeCompare(y.kelas) || x.nama.localeCompare(y.nama))

  const avgOf = (ts: Task[], s: Student) => {
    const sc = ts
      .map((t) => findA(t, s))
      .filter((a): a is Attempt => !!a && a.status === 'selesai')
      .map((a) => a.score ?? 0)
    return sc.length ? Math.round(sc.reduce((n, v) => n + v, 0) / sc.length) : null
  }
  type Cell = { text: string; tone: 'ok' | 'bad' | 'muted' | 'lock' }
  const cell = (t: Task, s: Student): Cell => {
    const a = findA(t, s)
    if (!a) return { text: '–', tone: 'muted' }
    if (a.status === 'selesai') return { text: String(a.score ?? 0), tone: (a.score ?? 0) >= t.kkm ? 'ok' : 'bad' }
    if (a.status === 'terkunci') return { text: 'Terkunci', tone: 'lock' }
    return { text: 'Proses', tone: 'muted' }
  }
  const toneColor = { ok: 'var(--green)', bad: 'var(--red)', muted: 'var(--ink-soft)', lock: 'var(--amber)' }

  let nFin = 0
  let nLulus = 0
  let sum = 0
  for (const t of tasks) for (const s of students) {
    const a = findA(t, s)
    if (a?.status === 'selesai') {
      nFin++
      sum += a.score ?? 0
      if ((a.score ?? 0) >= t.kkm) nLulus++
    }
  }
  const avgAll = nFin ? Math.round(sum / nFin) : 0
  const filterText = `Kelas: ${kelas || 'Semua'} · Mapel: ${mapel || 'Semua'}`

  const printNow = () => {
    try {
      window.print()
    } catch {
      setMsg('Cetak tidak tersedia di tampilan ini. Gunakan “Salin tabel”.')
    }
  }
  const tabelData = () => {
    const head = ['No', 'Nama', 'NIS', 'Kelas', ...groups.flatMap((g) => [...g.tasks.map((t) => `${g.mapel} – ${t.judul}`), `${g.mapel} rata-rata`]), 'Rata-rata']
    const body = students.map((s, i) => [
      i + 1, s.nama, s.nis, s.kelas,
      ...groups.flatMap((g) => [...g.tasks.map((t) => cell(t, s).text), avgOf(g.tasks, s) ?? '–']),
      avgOf(tasks, s) ?? '–',
    ])
    return { head, body }
  }
  const eksporCsv = () => {
    const { head, body } = tabelData()
    const namaKelas = kelas ? namaBerkasAman(kelas) : 'semua-kelas'
    const namaMapel = mapel ? namaBerkasAman(mapel) : 'semua-mapel'
    unduhCsv(`rekap-${namaKelas}-${namaMapel}-${tanggalHariIni()}.csv`, head, body)
  }
  const copyTable = async () => {
    const { head, body } = tabelData()
    try {
      await navigator.clipboard.writeText([head.join('\t'), ...body.map((r) => r.join('\t'))].join('\n'))
      setMsg(`${students.length} siswa tersalin. Tempel di Excel atau Word.`)
    } catch {
      setMsg('Browser menolak akses clipboard di tampilan ini.')
    }
  }

  const th = 'th text-center whitespace-nowrap'

  return (
    <section>
      <div className="no-print flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display text-2xl font-bold">Rekap hasil ujian</h1>
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Semua tugas per mapel tampil dalam satu tabel. Filter per kelas dan mapel.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="label" htmlFor="rk">Kelas</label>
            <select id="rk" className="input" style={{ minWidth: 150 }} value={kelas} onChange={(e) => setKelas(e.target.value)}>
              <option value="">Semua kelas</option>
              {kelasList.map((k) => <option key={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="rm">Mapel</label>
            <select id="rm" className="input" style={{ minWidth: 180 }} value={mapel} onChange={(e) => setMapel(e.target.value)}>
              <option value="">Semua mapel</option>
              {mapelList.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <button className="btn btn-ghost" onClick={copyTable}><Icon n="copy" /> Salin tabel</button>
          <button className="btn btn-ghost" onClick={eksporCsv} disabled={students.length === 0} title="Unduh rekap sebagai CSV (bisa dibuka di Excel)"><Icon n="upload" /> Ekspor CSV</button>
          <button className="btn btn-primary" onClick={printNow}><Icon n="eye" /> Cetak rekap</button>
        </div>
      </div>
      {msg && <p className="no-print text-sm mb-3" style={{ color: 'var(--ink-soft)' }}>{msg}</p>}

      <div className="card p-5 print-area">
        <div className="flex flex-wrap items-end justify-between gap-2 mb-4 pb-3 border-b" style={{ borderColor: 'var(--line)' }}>
          <div>
            <h2 className="font-display text-xl font-bold">Rekap Hasil Ujian</h2>
            <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{filterText} · Dicetak {new Date().toLocaleString('id-ID')}</p>
          </div>
          <p className="text-xs tabular-nums">{students.length} siswa · {tasks.length} tugas · Selesai {nFin} · Tuntas {nLulus} · Rata-rata {avgAll}</p>
        </div>

        {students.length === 0 ? (
          <Empty icon="chart" title="Belum ada hasil" hint="Tidak ada ujian yang sudah dikerjakan untuk filter ini." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse" style={{ minWidth: 640 + groups.reduce((n, g) => n + g.tasks.length * 120, 0) }}>
              <thead>
                <tr>
                  <th className={th} rowSpan={2}>No</th>
                  <th className={th + ' text-left'} rowSpan={2}>Nama</th>
                  <th className={th} rowSpan={2}>NIS</th>
                  <th className={th} rowSpan={2}>Kelas</th>
                  {groups.map((g) => (
                    <th key={g.mapel} className={th} colSpan={g.tasks.length + 1} style={{ background: 'var(--teal-tint)', color: 'var(--teal)' }}>{g.mapel}</th>
                  ))}
                  <th className={th} rowSpan={2}>Rata-rata</th>
                </tr>
                <tr>
                  {groups.flatMap((g) => [
                    ...g.tasks.map((t) => <th key={t.id} className={th + ' max-w-[180px]'} style={{ whiteSpace: 'normal' }}>{t.judul}<div className="font-normal normal-case text-[10px]" style={{ color: 'var(--ink-soft)' }}>KKM {t.kkm}</div></th>),
                    <th key={g.mapel + '-avg'} className={th} style={{ background: 'var(--tint-2)' }}>Rata-rata</th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {students.map((s, i) => (
                  <tr key={s.id}>
                    <td className="td text-center tabular-nums">{i + 1}</td>
                    <td className="td font-semibold whitespace-nowrap">{s.nama}</td>
                    <td className="td tabular-nums">{s.nis}</td>
                    <td className="td">{s.kelas}</td>
                    {groups.flatMap((g) => [
                      ...g.tasks.map((t) => {
                        const c = cell(t, s)
                        return <td key={t.id} className="td text-center tabular-nums font-bold" style={{ color: toneColor[c.tone] }}>{c.text}</td>
                      }),
                      <td key={g.mapel + '-avg'} className="td text-center tabular-nums font-bold" style={{ background: 'var(--tint-1)' }}>{avgOf(g.tasks, s) ?? '–'}</td>,
                    ])}
                    <td className="td text-center tabular-nums font-bold">{avgOf(tasks, s) ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] mt-3" style={{ color: 'var(--ink-soft)' }}>Hijau = tuntas KKM, merah = di bawah KKM, kuning = terkunci. “–” = belum mengerjakan.</p>
      </div>
    </section>
  )
}
