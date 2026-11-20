import { useCallback, useEffect, useRef, useState } from 'react'
import type { Task, ViolationType } from './types'
import { addViolation, answer, effectiveEnd, finishAttempt, isAnswered, setCursor, toggleRagu, useDB } from './store'
import { Icon, Modal, VIOLATION_LABEL, enterFS, fmtTime } from './ui'

type Overlay = null | { kind: 'resume' } | { kind: 'warn'; type: ViolationType }

interface Props {
  task: Task
  attemptId: string
  studentName: string
  studentNis: string
  fsEnforced: boolean
  onExit: () => void
}

export default function Exam({ task, attemptId, studentName, studentNis, fsEnforced, onExit }: Props) {
  const db = useDB()
  const a = db.attempts.find((x) => x.id === attemptId)
  const running = a?.status === 'berjalan'

  const [overlay, setOverlay] = useState<Overlay>(task.wajibFullscreen && !fsEnforced ? { kind: 'resume' } : null)
  const [fsNote, setFsNote] = useState(false)
  const [finishOpen, setFinishOpen] = useState(false)
  const [gridOpen, setGridOpen] = useState(false)
  const fsRef = useRef(fsEnforced)
  const armed = useRef(overlay === null)
  const last = useRef(0)
  armed.current = overlay === null

  // Attempt dihapus guru (reset) -> keluar
  useEffect(() => {
    if (!a) onExit()
  }, [a, onExit])

  // Keluar dari layar penuh saat ujian berakhir
  useEffect(() => {
    if (a && a.status !== 'berjalan' && document.fullscreenElement) document.exitFullscreen().catch(() => {})
  }, [a?.status])

  /* ---------------------------- ANTI CURANG ---------------------------- */
  useEffect(() => {
    if (!running) return
    const fire = (type: ViolationType, note?: string) => {
      if (!armed.current) return
      const now = Date.now()
      if (now - last.current < 1200) return // satu kejadian fisik = satu pelanggaran
      last.current = now
      addViolation(attemptId, type, note)
      setOverlay({ kind: 'warn', type })
    }
    const block = (e: Event) => e.preventDefault()

    const onVis = () => document.hidden && fire('tab')
    const onBlur = () => {
      window.setTimeout(() => {
        if (!document.hidden && !document.hasFocus()) fire('blur')
      }, 200)
    }
    const onFs = () => {
      if (fsRef.current && !document.fullscreenElement) fire('fullscreen')
    }
    const onClip = (e: Event) => {
      e.preventDefault()
      fire('salin', e.type)
    }
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      const mod = e.ctrlKey || e.metaKey
      if (e.key === 'F12' || (mod && e.shiftKey && ['i', 'j', 'c'].includes(k)) || (mod && ['u', 's', 'p'].includes(k))) {
        e.preventDefault()
        fire('shortcut', e.key === 'F12' ? 'F12' : (mod ? 'Ctrl+' : '') + e.key.toUpperCase())
      } else if (mod && ['c', 'v', 'x'].includes(k)) {
        e.preventDefault()
        fire('salin', 'Ctrl+' + e.key.toUpperCase())
      } else if ((mod && k === 'a') || e.key === 'F5' || (mod && k === 'r')) {
        e.preventDefault()
      } else if (e.key === 'PrintScreen') {
        fire('salin', 'PrintScreen')
        try {
          navigator.clipboard.writeText('')
        } catch {
          /* abaikan */
        }
      }
    }
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }

    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('blur', onBlur)
    document.addEventListener('fullscreenchange', onFs)
    for (const t of ['copy', 'cut', 'paste']) document.addEventListener(t, onClip)
    for (const t of ['contextmenu', 'dragstart', 'selectstart']) document.addEventListener(t, block)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('fullscreenchange', onFs)
      for (const t of ['copy', 'cut', 'paste']) document.removeEventListener(t, onClip)
      for (const t of ['contextmenu', 'dragstart', 'selectstart']) document.removeEventListener(t, block)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [running, attemptId])

  const backToExam = useCallback(async () => {
    if (task.wajibFullscreen) {
      const ok = await enterFS()
      fsRef.current = ok
      setFsNote(!ok)
    }
    last.current = Date.now()
    setOverlay(null)
  }, [task.wajibFullscreen])

  const onExpire = useCallback(() => finishAttempt(attemptId), [attemptId])

  if (!a) return null

  /* ------------------------------ TERKUNCI ------------------------------ */
  if (a.status === 'terkunci') {
    return (
      <Centered>
        <div className="grid place-items-center rounded-full mx-auto mb-4" style={{ width: 64, height: 64, background: 'var(--red-tint)', color: 'var(--red)' }}><Icon n="lock" s={30} /></div>
        <h1 className="font-display text-2xl font-bold">Ujian terkunci</h1>
        <p className="text-sm mt-2" style={{ color: 'var(--ink-soft)' }}>
          Pelanggaran mencapai batas ({task.maxPelanggaran}). Jawaban Anda tersimpan, namun akun dikunci. Hubungi guru untuk membuka kunci atau mereset ujian.
        </p>
        <button className="btn btn-primary mt-6" onClick={onExit}>Kembali ke beranda</button>
      </Centered>
    )
  }

  /* ------------------------------- SELESAI ------------------------------ */
  if (a.status === 'selesai') {
    const score = a.score ?? 0
    const pass = score >= task.kkm
    const answered = Object.keys(a.answers).filter((k) => a.answers[k].length > 0).length
    return (
      <Centered>
        <p className="label">{task.mapel}</p>
        <h1 className="font-display text-2xl font-bold">{task.judul}</h1>
        {task.tampilNilai ? (
          <>
            <div className="font-display font-bold leading-none my-6" style={{ fontSize: 88, color: pass ? 'var(--green)' : 'var(--red)' }}>{score}</div>
            <span className={`chip ${pass ? 'chip-green' : 'chip-red'}`}>{pass ? 'Tuntas' : 'Belum tuntas'} · KKM {task.kkm}</span>
            {!pass && <p className="text-sm mt-3" style={{ color: 'var(--ink-soft)' }}>Hubungi guru jika ada kesempatan mengulang.</p>}
          </>
        ) : (
          <p className="text-sm mt-4" style={{ color: 'var(--ink-soft)' }}>Jawaban Anda terkirim. Nilai akan diumumkan oleh guru.</p>
        )}
        <p className="text-xs mt-4" style={{ color: 'var(--ink-soft)' }}>{answered} dari {task.questions.length} soal terjawab</p>
        <button className="btn btn-primary mt-6" onClick={onExit}>Kembali ke beranda</button>
      </Centered>
    )
  }

  /* ------------------------------- UJIAN -------------------------------- */
  const total = a.order.length
  const cursor = Math.min(a.cursor, total - 1)
  const qid = a.order[cursor]
  const q = task.questions.find((x) => x.id === qid)!
  const chosen = a.answers[qid] ?? []
  const answeredCount = a.order.filter((id) => isAnswered(a, id)).length
  const isLast = cursor === total - 1
  const violations = a.violations.length

  const Grid = () => (
    <div className="grid grid-cols-5 gap-2">
      {a.order.map((id, i) => {
        const done = isAnswered(a, id)
        const cur = i === cursor
        return (
          <button
            key={id}
            disabled={task.kunciMaju}
            onClick={() => { setCursor(attemptId, i); setGridOpen(false) }}
            aria-label={`Soal ${i + 1}${done ? ', terjawab' : ''}`}
            aria-current={cur ? 'step' : undefined}
            className="rounded-md text-sm font-bold py-2 disabled:cursor-default"
            style={{
              background: done ? 'var(--teal)' : '#fff',
              color: done ? '#fff' : 'var(--ink)',
              border: '2px solid ' + (cur ? 'var(--amber)' : done ? 'var(--teal)' : 'var(--line)'),
            }}
          >
            {i + 1}{(a.ragu ?? []).includes(id) ? ' ?' : ''}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="exam-lock min-h-full flex flex-col" onContextMenu={(e) => e.preventDefault()}>
      <Watermark text={`${studentName} · ${studentNis}`} />

      <header className="sticky top-0 z-30 border-b" style={{ background: 'var(--card)', borderColor: 'var(--line)' }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-display font-bold truncate leading-tight">{task.judul}</div>
            <div className="text-xs truncate" style={{ color: 'var(--ink-soft)' }}>{task.mapel}</div>
          </div>
          {violations > 0 && (
            <span className="chip chip-amber hidden sm:inline-flex" title="Jumlah pelanggaran"><Icon n="alert" s={11} /> {violations}/{task.maxPelanggaran}</span>
          )}
          <Timer endsAt={effectiveEnd(a, task)} onExpire={onExpire} />
          {!task.kunciMaju && (
            <button className="btn btn-ghost btn-sm lg:hidden" onClick={() => setGridOpen(true)} aria-label="Daftar soal"><Icon n="grid" s={15} /></button>
          )}
        </div>
        <div style={{ height: 3, background: '#e6dfcd' }}>
          <div style={{ width: `${(answeredCount / total) * 100}%`, height: 3, background: 'var(--teal)', transition: 'width .2s' }} />
        </div>
      </header>

      <main className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 flex-1 grid lg:grid-cols-[1fr_250px] gap-6 items-start">
        <section className="min-w-0">
          <div className="flex items-center justify-between mb-3">
            <span className="chip chip-teal">Soal {cursor + 1} dari {total}</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => toggleRagu(attemptId, qid)}
                aria-pressed={(a.ragu ?? []).includes(qid)}
                className="btn btn-sm"
                style={(a.ragu ?? []).includes(qid) ? { background: 'var(--amber-tint)', color: '#8a5a00', border: '1px solid var(--amber)' } : { background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
              >
                <Icon n="alert" s={13} /> Ragu-ragu
              </button>
              <span className="chip chip-amber">Bobot {q.bobot ?? 1}</span>
              <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{answeredCount} terjawab</span>
            </div>
          </div>

          <div className="card p-5 sm:p-7">
            {q.gambar && <img src={q.gambar} alt="Gambar soal" className="mb-5 rounded-md border max-h-72 w-auto max-w-full" style={{ borderColor: 'var(--line)' }} />}
            <p className="font-display text-xl sm:text-2xl leading-snug whitespace-pre-wrap">{q.text}</p>
            {q.tipe === 'pgk' && <p className="text-sm mt-2 font-semibold" style={{ color: 'var(--teal)' }}>Pilih semua jawaban yang benar. Pilihan yang salah mengurangi nilai soal ini.</p>}
            <div className="mt-6 space-y-3" role="radiogroup" aria-label="Pilihan jawaban">
              {a.optionOrder[qid].map((orig, pos) => {
                const sel = chosen.includes(orig)
                return (
                  <button
                    key={orig}
                    role={q.tipe === 'pgk' ? 'checkbox' : 'radio'}
                    aria-checked={sel}
                    onClick={() => answer(attemptId, qid, orig)}
                    className="w-full text-left flex items-start gap-3 rounded-lg px-4 py-3.5 transition-colors"
                    style={{ border: '2px solid ' + (sel ? 'var(--teal)' : 'var(--line)'), background: sel ? 'var(--teal-tint)' : '#fff' }}
                  >
                    <span className="shrink-0 grid place-items-center rounded-full font-bold text-sm" style={{ width: 28, height: 28, background: sel ? 'var(--teal)' : '#efe9da', color: sel ? '#fff' : 'var(--ink-soft)' }}>
                      {String.fromCharCode(65 + pos)}
                    </span>
                    <span className="pt-0.5 text-[15px] sm:text-base">{q.options[orig]}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-between mt-5 gap-3">
            <button className="btn btn-ghost" disabled={task.kunciMaju || cursor === 0} onClick={() => setCursor(attemptId, cursor - 1)}>
              <Icon n="left" s={15} /> Sebelumnya
            </button>
            {isLast ? (
              <button className="btn btn-amber" onClick={() => setFinishOpen(true)}><Icon n="check" s={15} /> Selesai</button>
            ) : (
              <button className="btn btn-primary" onClick={() => setCursor(attemptId, cursor + 1)}>
                {!chosen.length && task.kunciMaju ? 'Lewati' : 'Berikutnya'} <Icon n="right" s={15} />
              </button>
            )}
          </div>
          {task.kunciMaju && <p className="text-xs mt-3" style={{ color: 'var(--ink-soft)' }}>Mode hanya maju: soal yang sudah dilewati tidak dapat dibuka lagi.</p>}
          {fsNote && <p className="text-xs mt-3" style={{ color: 'var(--ink-soft)' }}>Layar penuh tidak tersedia di perangkat ini; pindah tab tetap dicatat.</p>}
        </section>

        <aside className="hidden lg:block card p-4 sticky top-20">
          <div className="label">Daftar soal</div>
          <Grid />
          {!task.kunciMaju && isLast ? null : null}
          <button className="btn btn-amber w-full mt-4" onClick={() => setFinishOpen(true)}>Selesai & kirim</button>
        </aside>
      </main>

      <Modal open={gridOpen} onClose={() => setGridOpen(false)} title="Daftar soal">
        <Grid />
        <button className="btn btn-amber w-full mt-4" onClick={() => { setGridOpen(false); setFinishOpen(true) }}>Selesai & kirim</button>
      </Modal>

      <Modal open={finishOpen} onClose={() => setFinishOpen(false)} title="Kirim jawaban?">
        <p className="text-sm">
          Anda menjawab <b>{answeredCount}</b> dari <b>{total}</b> soal.
          {answeredCount < total && <span style={{ color: 'var(--red)' }}> {total - answeredCount} soal belum dijawab.</span>}
        </p>
        <p className="text-xs mt-2" style={{ color: 'var(--ink-soft)' }}>Setelah dikirim, jawaban tidak dapat diubah.</p>
        {(a.ragu?.length ?? 0) > 0 && <p className="text-sm mt-2 font-semibold" style={{ color: '#8a5a00' }}>{a.ragu!.length} soal masih ditandai ragu-ragu.</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn btn-ghost" onClick={() => setFinishOpen(false)}>Periksa lagi</button>
          <button className="btn btn-primary" onClick={() => { setFinishOpen(false); finishAttempt(attemptId) }}>Ya, kirim</button>
        </div>
      </Modal>

      {overlay && (
        <div className="fixed inset-0 z-[70] grid place-items-center p-6" style={{ background: 'var(--ink)' }} role="alertdialog" aria-modal="true">
          <div className="card p-7 max-w-md w-full text-center">
            {overlay.kind === 'resume' ? (
              <>
                <div className="grid place-items-center rounded-full mx-auto mb-4" style={{ width: 56, height: 56, background: 'var(--teal-tint)', color: 'var(--teal)' }}><Icon n="shield" s={26} /></div>
                <h2 className="font-display text-2xl font-bold">Lanjutkan ujian</h2>
                <p className="text-sm mt-2" style={{ color: 'var(--ink-soft)' }}>Ujian dilanjutkan dalam layar penuh. Waktu tetap berjalan sejak Anda mulai.</p>
                <button className="btn btn-primary mt-5 w-full" onClick={backToExam}>Lanjutkan</button>
              </>
            ) : (
              <>
                <div className="grid place-items-center rounded-full mx-auto mb-4" style={{ width: 56, height: 56, background: 'var(--amber-tint)', color: 'var(--amber)' }}><Icon n="alert" s={26} /></div>
                <h2 className="font-display text-2xl font-bold">Pelanggaran {violations} dari {task.maxPelanggaran}</h2>
                <p className="text-sm font-semibold mt-1">{VIOLATION_LABEL[overlay.type]}</p>
                <p className="text-sm mt-2" style={{ color: 'var(--ink-soft)' }}>
                  {violations >= task.maxPelanggaran - 1 ? 'Satu pelanggaran lagi dan ujian akan terkunci.' : 'Tetap di halaman ujian sampai selesai. Waktu terus berjalan.'}
                </p>
                <button className="btn btn-primary mt-5 w-full" onClick={backToExam}>Kembali ke ujian</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Timer({ endsAt, onExpire }: { endsAt: number; onExpire: () => void }) {
  const [left, setLeft] = useState(() => endsAt - Date.now())
  useEffect(() => {
    const tick = () => {
      const l = endsAt - Date.now()
      setLeft(l)
      if (l <= 0) onExpire()
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [endsAt, onExpire])
  const urgent = left < 60_000
  const warn = left < 300_000
  return (
    <div
      className="flex items-center gap-1.5 font-bold tabular-nums rounded-md px-2.5 py-1.5"
      style={{ background: urgent ? 'var(--red-tint)' : warn ? 'var(--amber-tint)' : '#efe9da', color: urgent ? 'var(--red)' : warn ? '#8a5a00' : 'var(--ink)' }}
      role="timer"
      aria-label="Sisa waktu"
    >
      <Icon n="clock" s={15} /> {fmtTime(left)}
    </div>
  )
}

function Watermark({ text }: { text: string }) {
  const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='280' height='170'><text x='24' y='95' font-size='15' font-family='sans-serif' fill='rgba(23,38,43,0.075)' transform='rotate(-24 140 85)'>${safe}</text></svg>`
  return <div aria-hidden="true" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 40, backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")` }} />
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full grid place-items-center p-6">
      <div className="card p-8 max-w-md w-full text-center">{children}</div>
    </div>
  )
}
