import { useEffect, useState } from 'react'
import type { Task } from './types'
import { addViolation, beginAttempt, correctCount, findAttempt, getDB, getSession, isExpired, jumlahSoal, logout, remoteOn, taskAudience, useDB } from './store'
import Exam from './Exam'
import { Empty, Icon, Modal, ThemeSwitch, enterFS } from './ui'

export default function Student({ studentId }: { studentId: string }) {
  const db = useDB()
  const me = db.students.find((s) => s.id === studentId)
  const [brief, setBrief] = useState<Task | null>(null)
  const [agree, setAgree] = useState(false)
  const [exam, setExam] = useState<{ taskId: string; attemptId: string; fs: boolean } | null>(null)

  // Jika halaman dimuat ulang saat ujian berjalan: lanjutkan otomatis dan catat sebagai pelanggaran.
  useEffect(() => {
    const running = getRunning(studentId)
    if (running) {
      addViolation(running.id, 'reload')
      setExam({ taskId: running.taskId, attemptId: running.id, fs: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sess = getSession()
  if (me?.sesiToken && sess?.token && me.sesiToken !== sess.token) {
    return (
      <div className="min-h-full grid place-items-center p-6">
        <div className="card p-8 max-w-md w-full text-center">
          <div className="grid place-items-center rounded-full mx-auto mb-4" style={{ width: 56, height: 56, background: 'var(--red-tint)', color: 'var(--red)' }}><Icon n="shield" s={26} /></div>
          <h1 className="font-display text-2xl font-bold">Akun dipakai di perangkat lain</h1>
          <p className="text-sm mt-2" style={{ color: 'var(--ink-soft)' }}>Satu akun hanya aktif di satu perangkat. Login di sini sudah mengeluarkan perangkat lainnya. Ujian yang sedang berjalan tetap tersimpan.</p>
          <button className="btn btn-primary mt-5" onClick={logout}>Keluar dari perangkat ini</button>
        </div>
      </div>
    )
  }
  if (!me) return null
  const tasks = db.tasks.filter((t) => t.aktif && (t.kelas.length === 0 || t.kelas.includes(me.kelas)))

  const activeExamTask = exam ? db.tasks.find((t) => t.id === exam.taskId) : null
  if (exam && activeExamTask) {
    return (
      <Exam
        task={activeExamTask}
        attemptId={exam.attemptId}
        studentName={me.nama}
        studentNis={me.nis}
        fsEnforced={exam.fs}
        onExit={() => {
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
          setExam(null)
        }}
      />
    )
  }

  const begin = async () => {
    if (!brief) return
    const fs = brief.wajibFullscreen ? await enterFS() : false
    const a = await beginAttempt(brief, studentId)
    if (!a) {
      setBrief(null)
      return
    }
    setBrief(null)
    setAgree(false)
    setExam({ taskId: brief.id, attemptId: a.id, fs })
  }

  return (
    <div className="min-h-full">
      <header className="border-b" style={{ background: 'var(--card)', borderColor: 'var(--line)' }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 min-h-[56px] py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="grid place-items-center rounded-md" style={{ width: 28, height: 28, background: 'var(--teal)', color: 'var(--on-teal)' }}><Icon n="task" s={15} /></div>
            <span className="font-display font-bold text-lg">UjianKu</span>
          </div>
          <div className="flex items-center gap-2"><ThemeSwitch /><button className="btn btn-ghost btn-sm" onClick={logout}><Icon n="logout" s={14} /> Keluar</button></div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <p className="text-sm font-semibold" style={{ color: 'var(--teal)' }}>{me.kelas} · NIS {me.nis}</p>
        <h1 className="font-display text-3xl font-bold mt-1">Halo, {me.nama.split(' ')[0]}.</h1>

        {me.locked && (
          <div className="mt-5 flex items-start gap-3 rounded-lg px-4 py-3 text-sm" style={{ background: 'var(--red-tint)', color: 'var(--red)' }} role="alert">
            <Icon n="lock" s={18} className="mt-0.5 shrink-0" />
            <div><b>Akun Anda terkunci.</b> Hubungi guru untuk membuka kunci sebelum melanjutkan ujian.</div>
          </div>
        )}

        <h2 className="font-display text-xl font-bold mt-8 mb-3">Tugas untuk Anda</h2>
        {tasks.length === 0 ? (
          <div className="card"><Empty icon="book" title="Belum ada tugas aktif" hint="Tugas akan muncul di sini ketika guru mengaktifkannya." /></div>
        ) : (
          <div className="space-y-3">
            {tasks.map((t) => {
              const a = findAttempt(t.id, studentId)
              const status = a?.status
              return (
                <article key={t.id} className="card p-5 flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-[220px]">
                    <span className="chip chip-teal">{t.mapel}</span>
                    <h3 className="font-display text-xl font-bold mt-1.5">{t.judul}</h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm mt-2" style={{ color: 'var(--ink-soft)' }}>
                      <span><Icon n="book" s={13} className="inline mr-1 -mt-0.5" />{jumlahSoal(t)} soal</span>
                      <span><Icon n="clock" s={13} className="inline mr-1 -mt-0.5" />{t.durasi} menit</span>
                      <span>KKM {t.kkm}</span>
                      {t.batasAkhir && <span>Batas: {new Date(t.batasAkhir).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {status === 'selesai' && (
                      <div className="text-right">
                        <span className="chip chip-green">Selesai</span>
                        {t.tampilNilai && <div className="font-display text-2xl font-bold leading-none mt-1" style={{ color: (a!.score ?? 0) >= t.kkm ? 'var(--green)' : 'var(--red)' }}>{a!.score}</div>}
                      </div>
                    )}
                    {status === 'terkunci' && <span className="chip chip-red"><Icon n="lock" s={11} /> Terkunci</span>}
                    {!status && isExpired(t) && <span className="chip chip-gray">Ditutup</span>}
                    {(!status || status === 'berjalan') && (
                      <button className="btn btn-primary" disabled={me.locked || (!status && isExpired(t))} onClick={() => setBrief(t)}>
                        <Icon n="play" s={13} /> {status === 'berjalan' ? 'Lanjutkan' : 'Mulai ujian'}
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
        <MyRecap studentId={studentId} kelas={me.kelas} />
      </main>

      <Modal open={!!brief} onClose={() => { setBrief(null); setAgree(false) }} title="Sebelum memulai" wide>
        {brief && (
          <>
            <h3 className="font-display text-xl font-bold">{brief.judul}</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--ink-soft)' }}>{brief.mapel} · {jumlahSoal(brief)} soal · {brief.durasi} menit · KKM {brief.kkm}</p>
            <ul className="space-y-2 text-sm">
              {[
                'Soal tampil satu per satu' + (brief.acakSoal ? ' dengan urutan acak.' : '.'),
                brief.kunciMaju ? 'Anda tidak dapat kembali ke soal sebelumnya.' : 'Anda boleh berpindah antar soal sebelum waktu habis.',
                brief.batasAkhir ? `Ujian ditutup otomatis pada ${new Date(brief.batasAkhir).toLocaleString('id-ID')}.` : null,
                'Waktu terus berjalan walau halaman ditutup. Ujian terkirim otomatis saat waktu habis.',
                brief.wajibFullscreen ? 'Ujian berjalan dalam layar penuh. Keluar dari layar penuh dicatat sebagai pelanggaran.' : null,
                'Pindah tab/aplikasi, salin-tempel, dan pintasan terlarang dicatat sebagai pelanggaran.',
                `Setelah ${brief.maxPelanggaran} pelanggaran, ujian dan akun Anda terkunci dan hanya guru yang dapat membukanya.`,
              ].filter(Boolean).map((r) => (
                <li key={r as string} className="flex gap-2"><Icon n="check" s={15} className="mt-0.5 shrink-0" />{r}</li>
              ))}
            </ul>
            <label className="flex items-start gap-2 mt-5 text-sm font-semibold cursor-pointer">
              <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              Saya sudah membaca dan siap mengerjakan dengan jujur.
            </label>
            <div className="flex justify-end gap-2 mt-5">
              <button className="btn btn-ghost" onClick={() => { setBrief(null); setAgree(false) }}>Batal</button>
              <button className="btn btn-primary" disabled={!agree} onClick={begin}><Icon n="play" s={13} /> {findAttempt(brief.id, studentId) ? 'Lanjutkan' : 'Mulai sekarang'}</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

function getRunning(studentId: string) {
  const d = getDB()
  return d.attempts.find((a) => a.studentId === studentId && a.status === 'berjalan' && d.tasks.some((t) => t.id === a.taskId && t.aktif))
}

/* ============================ REKAP TUGAS SAYA ============================ */

type RecapFilter = 'semua' | 'belum' | 'selesai' | 'terlewat'

function MyRecap({ studentId, kelas }: { studentId: string; kelas: string }) {
  const db = useDB()
  const [f, setF] = useState<RecapFilter>('semua')

  const rows = db.tasks
    .filter((t) => t.aktif && taskAudience(t, kelas))
    .map((t) => {
      const a = findAttempt(t.id, studentId)
      const st =
        a?.status === 'selesai' ? 'selesai'
        : a?.status === 'terkunci' ? 'terkunci'
        : a?.status === 'berjalan' ? 'berjalan'
        : isExpired(t) ? 'terlewat'
        : 'belum'
      return { t, a, st }
    })

  const isInFilter = (st: string) =>
    f === 'semua' ||
    (f === 'belum' && (st === 'belum' || st === 'berjalan')) ||
    (f === 'selesai' && st === 'selesai') ||
    (f === 'terlewat' && (st === 'terlewat' || st === 'terkunci'))
  const view = rows.filter((r) => isInFilter(r.st))

  const cnt = {
    selesai: rows.filter((r) => r.st === 'selesai').length,
    belum: rows.filter((r) => r.st === 'belum' || r.st === 'berjalan').length,
    terlewat: rows.filter((r) => r.st === 'terlewat' || r.st === 'terkunci').length,
  }
  const scored = rows.filter((r) => r.st === 'selesai' && r.t.tampilNilai && r.a)
  const avg = scored.length ? Math.round(scored.reduce((n, r) => n + (r.a!.score ?? 0), 0) / scored.length) : null

  const chip: Record<string, [string, string]> = {
    selesai: ['Selesai', 'chip-green'],
    berjalan: ['Sedang dikerjakan', 'chip-teal'],
    belum: ['Belum dikerjakan', 'chip-amber'],
    terlewat: ['Terlewat', 'chip-gray'],
    terkunci: ['Terkunci', 'chip-red'],
  }
  const fmt = (ms: number) => new Date(ms).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })

  const tiles: [string, string | number, string][] = [
    ['Total tugas', rows.length, 'var(--ink)'],
    ['Selesai', cnt.selesai, 'var(--green)'],
    ['Belum dikerjakan', cnt.belum, cnt.belum ? 'var(--amber-ink)' : 'var(--ink)'],
    ['Terlewat / terkunci', cnt.terlewat, cnt.terlewat ? 'var(--red)' : 'var(--ink)'],
    ['Rata-rata nilai', avg ?? '–', 'var(--ink)'],
  ]
  const filters: [RecapFilter, string][] = [
    ['semua', 'Semua'],
    ['belum', 'Belum dikerjakan'],
    ['selesai', 'Selesai'],
    ['terlewat', 'Terlewat'],
  ]

  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-bold">Rekap tugas saya</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--ink-soft)' }}>Daftar tugas yang sudah dan belum Anda kerjakan.</p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {tiles.map(([l, v, c]) => (
          <div key={l} className="card px-4 py-3">
            <div className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>{l}</div>
            <div className="font-display text-2xl font-bold mt-1 leading-none" style={{ color: c }}>{v}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3" role="tablist" aria-label="Filter rekap">
        {filters.map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={f === k}
            onClick={() => setF(k)}
            className="rounded-full px-3 py-1 text-xs font-bold"
            style={f === k ? { background: 'var(--teal)', color: 'var(--on-teal)', border: '1px solid var(--teal)' } : { background: 'var(--card)', color: 'var(--ink)', border: '1px solid var(--line)' }}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        {view.length === 0 ? (
          <Empty icon="book" title="Tidak ada tugas di kategori ini" hint="Pilih filter lain untuk melihat tugas lainnya." />
        ) : (
          <table className="w-full text-sm" style={{ tableLayout: 'fixed', minWidth: 560 }}>
            <thead>
              <tr>
                <th className="th" style={{ width: '40%' }}>Tugas</th>
                <th className="th hidden md:table-cell" style={{ width: '22%' }}>Batas akhir</th>
                <th className="th" style={{ width: '20%' }}>Status</th>
                <th className="th text-right" style={{ width: '18%' }}>Nilai</th>
              </tr>
            </thead>
            <tbody>
              {view.map(({ t, a, st }) => {
                const [label, cls] = chip[st]
                return (
                  <tr key={t.id}>
                    <td className="td break-words">
                      <div className="font-semibold">{t.judul}</div>
                      <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{t.mapel} · {jumlahSoal(t)} soal · KKM {t.kkm}</div>
                    </td>
                    <td className="td hidden md:table-cell text-xs break-words">{t.batasAkhir ? fmt(t.batasAkhir) : 'Tanpa batas'}</td>
                    <td className="td"><span className={`chip ${cls}`}>{label}</span></td>
                    <td className="td text-right">
                      {st === 'selesai' && a ? (
                        t.tampilNilai ? (
                          <>
                            <div className="font-display text-xl font-bold" style={{ color: (a.score ?? 0) >= t.kkm ? 'var(--green)' : 'var(--red)' }}>{a.score}</div>
                            {!remoteOn && <div className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>{correctCount(t, a)}/{t.questions.length} benar</div>}
                          </>
                        ) : <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>Dinilai guru</span>
                      ) : <span style={{ color: 'var(--ink-soft)' }}>–</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
