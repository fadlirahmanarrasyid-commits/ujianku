import type { ReactNode } from 'react'
import { computeScore, jumlahPelanggaranOf, taskAudience, useDB } from './store'
import type { Attempt, Student, Task } from './types'
import { Empty, Icon } from './ui'

type Tab = 'tugas' | 'siswa' | 'hasil' | 'bank'

const JAM_24 = 24 * 60 * 60 * 1000

/** Nilai satu percobaan. Mode Supabase membawa skor dari server; mode lokal dihitung dari jawaban. */
function skorOf(a: Attempt, t: Task | undefined): number | undefined {
  if (a.score !== undefined) return a.score
  if (a.status === 'selesai' && t) return computeScore(t, a)
  return undefined
}

function Kartu({ judul, nilai, hint, ikon, warna }: { judul: string; nilai: string | number; hint?: string; ikon: string; warna: string }) {
  return (
    <div className="card p-4 min-w-0">
      <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--ink-soft)' }}>
        <span className="inline-grid place-items-center w-7 h-7 rounded-md" style={{ background: warna, color: 'var(--teal)' }}>
          <Icon n={ikon} s={14} />
        </span>
        <span className="truncate">{judul}</span>
      </div>
      <div className="font-display text-2xl font-bold mt-2 tabular-nums">{nilai}</div>
      {hint && <div className="text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>{hint}</div>}
    </div>
  )
}

function Bagian({ judul, children, aksi }: { judul: string; children: ReactNode; aksi?: ReactNode }) {
  return (
    <section className="card p-4 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="font-display font-bold text-base">{judul}</h2>
        {aksi}
      </div>
      {children}
    </section>
  )
}

export function Dashboard({ onGo }: { onGo: (t: Tab) => void }) {
  const db = useDB()
  const now = Date.now()
  const siswaBy = new Map<string, Student>(db.students.map((s) => [s.id, s]))
  const tugasBy = new Map<string, Task>(db.tasks.map((t) => [t.id, t]))

  const aktif = db.tasks.filter((t) => t.aktif)
  const sedang = db.attempts.filter((a) => a.status === 'berjalan' && a.endsAt > now)
  const selesai = db.attempts.filter((a) => a.status === 'selesai')
  const skorSelesai = selesai
    .map((a) => ({ a, s: skorOf(a, tugasBy.get(a.taskId)) }))
    .filter((x): x is { a: Attempt; s: number } => x.s !== undefined)
  const rataRata = skorSelesai.length ? Math.round(skorSelesai.reduce((n, x) => n + x.s, 0) / skorSelesai.length) : null
  const totalPelanggaran = db.attempts.reduce((n, a) => n + jumlahPelanggaranOf(a), 0)
  const terkunci = db.students.filter((s) => s.locked)

  const akanBerakhir = aktif.filter((t) => t.batasAkhir !== null && t.batasAkhir > now && t.batasAkhir - now <= JAM_24)

  // Penugasan dengan siswa di bawah KKM, dihitung dari percobaan yang sudah selesai.
  const dibawahKkm = db.tasks
    .map((t) => {
      const sel = selesai.filter((a) => a.taskId === t.id)
      const nilai = sel.map((a) => skorOf(a, t)).filter((x): x is number => x !== undefined)
      return { t, peserta: db.attempts.filter((a) => a.taskId === t.id).length, selesai: sel.length, tuntas: nilai.filter((x) => x >= t.kkm).length, rata: nilai.length ? Math.round(nilai.reduce((n, x) => n + x, 0) / nilai.length) : null }
    })
    .filter((r) => r.selesai > 0)
    .sort((x, y) => y.t.createdAt - x.t.createdAt)

  const pelanggaranPerSiswa = new Map<string, number>()
  for (const a of db.attempts) {
    const j = jumlahPelanggaranOf(a)
    if (j > 0) pelanggaranPerSiswa.set(a.studentId, (pelanggaranPerSiswa.get(a.studentId) ?? 0) + j)
  }
  const teratas = [...pelanggaranPerSiswa.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5)

  const terbaru = [...selesai].sort((x, y) => (y.finishedAt ?? 0) - (x.finishedAt ?? 0)).slice(0, 6)
  const tanggal = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const kosong = db.students.length === 0 && db.tasks.length === 0

  return (
    <section className="space-y-5 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold">Beranda</h1>
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{tanggal}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary btn-sm" onClick={() => onGo('tugas')}><Icon n="plus" s={13} /> Buat penugasan</button>
          <button className="btn btn-ghost btn-sm" onClick={() => onGo('siswa')}><Icon n="users" s={13} /> Siswa</button>
          <button className="btn btn-ghost btn-sm" onClick={() => onGo('hasil')}><Icon n="chart" s={13} /> Hasil</button>
          <button className="btn btn-ghost btn-sm" onClick={() => onGo('bank')}><Icon n="grid" s={13} /> Bank soal</button>
        </div>
      </div>

      {kosong ? (
        <div className="card">
          <Empty icon="chart" title="Belum ada data" hint="Tambahkan siswa dan buat penugasan pertama. Ringkasan akan muncul di sini." />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kartu judul="Siswa" nilai={db.students.length} hint={terkunci.length ? `${terkunci.length} terkunci` : 'semua aktif'} ikon="users" warna="var(--teal-tint)" />
            <Kartu judul="Penugasan aktif" nilai={aktif.length} hint={`${db.tasks.length} total`} ikon="task" warna="var(--teal-tint)" />
            <Kartu judul="Sedang ujian" nilai={sedang.length} hint="percobaan berjalan" ikon="clock" warna="var(--teal-tint)" />
            <Kartu judul="Rata-rata nilai" nilai={rataRata ?? '–'} hint={skorSelesai.length ? `dari ${skorSelesai.length} ujian selesai` : 'belum ada ujian selesai'} ikon="chart" warna="var(--teal-tint)" />
            <Kartu judul="Pelanggaran" nilai={totalPelanggaran} hint="semua penugasan" ikon="alert" warna="var(--amber-tint)" />
            <Kartu judul="Soal di bank" nilai={db.bank.length} hint="siap dipakai ulang" ikon="book" warna="var(--teal-tint)" />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Bagian judul="Perlu perhatian">
              <ul className="space-y-2 text-sm">
                {akanBerakhir.length === 0 && terkunci.length === 0 && dibawahKkm.every((r) => r.tuntas === r.selesai) && (
                  <li style={{ color: 'var(--ink-soft)' }}>Tidak ada yang mendesak.</li>
                )}
                {akanBerakhir.map((t) => (
                  <li key={t.id} className="flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--amber-tint)', color: 'var(--amber)' }}>
                    <Icon n="clock" s={14} className="mt-0.5 shrink-0" />
                    <span className="min-w-0"><b>{t.judul}</b> berakhir dalam 24 jam, pada {new Date(t.batasAkhir!).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}.</span>
                  </li>
                ))}
                {terkunci.slice(0, 5).map((s) => (
                  <li key={s.id} className="flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--red-tint)', color: 'var(--red)' }}>
                    <Icon n="lock" s={14} className="mt-0.5 shrink-0" />
                    <span className="min-w-0"><b>{s.nama}</b> ({s.kelas || 'tanpa kelas'}) terkunci. Buka dari menu Siswa.</span>
                  </li>
                ))}
                {dibawahKkm.filter((r) => r.tuntas < r.selesai).slice(0, 5).map((r) => (
                  <li key={r.t.id} className="flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--teal-tint)' }}>
                    <Icon n="chart" s={14} className="mt-0.5 shrink-0" />
                    <span className="min-w-0"><b>{r.t.judul}</b>: {r.selesai - r.tuntas} dari {r.selesai} siswa belum mencapai KKM {r.t.kkm}.</span>
                  </li>
                ))}
              </ul>
            </Bagian>

            <Bagian judul="Pelanggaran tertinggi">
              {teratas.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Belum ada pelanggaran tercatat.</p>
              ) : (
                <ol className="space-y-2 text-sm">
                  {teratas.map(([sid, j]) => (
                    <li key={sid} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate">{siswaBy.get(sid)?.nama ?? 'Siswa dihapus'} <span style={{ color: 'var(--ink-soft)' }}>· {siswaBy.get(sid)?.kelas || '–'}</span></span>
                      <span className="chip chip-amber tabular-nums shrink-0">{j}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Bagian>
          </div>

          <Bagian judul="Ringkasan penugasan" aksi={<button className="btn btn-ghost btn-sm" onClick={() => onGo('tugas')}>Semua penugasan</button>}>
            {db.tasks.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Belum ada penugasan.</p>
            ) : (
              <div className="grid md:grid-cols-2 gap-3">
                {[...db.tasks].sort((x, y) => y.createdAt - x.createdAt).slice(0, 6).map((t) => {
                  const r = dibawahKkm.find((x) => x.t.id === t.id)
                  const peserta = db.attempts.filter((a) => a.taskId === t.id).length
                  const persen = r && r.selesai ? Math.round((r.tuntas / r.selesai) * 100) : 0
                  const sasaran = db.students.filter((s) => taskAudience(t, s.kelas)).length
                  return (
                    <div key={t.id} className="rounded-lg border p-3 min-w-0" style={{ borderColor: 'var(--line)' }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{t.judul}</div>
                          <div className="text-xs truncate" style={{ color: 'var(--ink-soft)' }}>{t.mapel} · {t.kelas.length ? t.kelas.join(', ') : 'Semua kelas'}</div>
                        </div>
                        <span className={`chip shrink-0 ${t.aktif ? 'chip-green' : 'chip-gray'}`}>{t.aktif ? 'Aktif' : 'Nonaktif'}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs mt-3" style={{ color: 'var(--ink-soft)' }}>
                        <div><div className="font-bold text-sm tabular-nums" style={{ color: 'var(--ink)' }}>{peserta}/{sasaran}</div>mengerjakan</div>
                        <div><div className="font-bold text-sm tabular-nums" style={{ color: 'var(--ink)' }}>{r?.rata ?? '–'}</div>rata-rata</div>
                        <div><div className="font-bold text-sm tabular-nums" style={{ color: 'var(--ink)' }}>{r?.selesai ? `${persen}%` : '–'}</div>tuntas KKM {t.kkm}</div>
                      </div>
                      <div className="h-1.5 rounded-full mt-3 overflow-hidden" style={{ background: 'var(--line)' }} role="progressbar" aria-valuenow={persen} aria-valuemin={0} aria-valuemax={100} aria-label={`Ketuntasan ${t.judul}`}>
                        <div className="h-full rounded-full" style={{ width: `${persen}%`, background: 'var(--teal)' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Bagian>

          <Bagian judul="Aktivitas terbaru" aksi={<button className="btn btn-ghost btn-sm" onClick={() => onGo('hasil')}>Lihat hasil</button>}>
            {terbaru.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Belum ada ujian yang selesai.</p>
            ) : (
              <ul className="divide-y text-sm" style={{ borderColor: 'var(--line)' }}>
                {terbaru.map((a) => {
                  const t = tugasBy.get(a.taskId)
                  const s = skorOf(a, t)
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate"><b>{siswaBy.get(a.studentId)?.nama ?? 'Siswa dihapus'}</b> · {t?.judul ?? 'Penugasan dihapus'}</div>
                        <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{a.finishedAt ? new Date(a.finishedAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : ''}</div>
                      </div>
                      <span className={`chip shrink-0 tabular-nums ${s !== undefined && t && s >= t.kkm ? 'chip-green' : 'chip-red'}`}>{s ?? '–'}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Bagian>
        </>
      )}
    </section>
  )
}
