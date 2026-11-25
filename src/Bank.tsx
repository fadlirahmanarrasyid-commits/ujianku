import { useState, type ReactNode } from 'react'
import type { BankItem } from './types'
import { daftarMapel, emptyQuestion, removeBank, renameBankGroup, saveBank, uid, useDB } from './store'
import { parseAiken } from './aiken'
import { bacaBerkasAiken } from './aikenBerkas'
import { QuestionCard, soalValid } from './Tasks'
import { Empty, Icon, Modal, usePagination } from './ui'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      {children}
    </div>
  )
}

const TIPE: Record<string, string> = { pg: 'Pilihan ganda', pgk: 'PG kompleks', bs: 'Benar / Salah', isian: 'Isian singkat', jodoh: 'Menjodohkan' }
type Ctx = { kelas: string; mapel: string; materi: string }
const keyOf = (c: Ctx) => [c.kelas, c.mapel, c.materi].join('||')

/**
 * Bank soal: ringkasan per Kelas, Mapel, dan Materi.
 * Soal baru hanya tampil setelah satu materi dibuka.
 */
export function BankPage() {
  const db = useDB()
  const [kelas, setKelas] = useState('')
  const [mapel, setMapel] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [edit, setEdit] = useState<BankItem | null>(null)
  const [del, setDel] = useState<BankItem | null>(null)
  const [imp, setImp] = useState(false)
  const [grup, setGrup] = useState<Ctx | null>(null)

  const kelasList = [...new Set([...db.students.map((s) => s.kelas), ...db.bank.map((b) => b.kelas)].filter(Boolean))].sort()
  const mapelList = daftarMapel()

  // Kelompokkan soal per kelas + mapel + materi
  const groupMap = new Map<string, { ctx: Ctx; items: BankItem[] }>()
  for (const b of db.bank) {
    const ctx = { kelas: b.kelas || '', mapel: b.mapel, materi: b.materi || '' }
    const k = keyOf(ctx)
    const g = groupMap.get(k) ?? { ctx, items: [] }
    g.items.push(b)
    groupMap.set(k, g)
  }
  const groups = [...groupMap.entries()]
    .map(([key, g]) => ({ key, ...g }))
    .filter(
      (g) =>
        (!kelas || g.ctx.kelas === kelas) &&
        (!mapel || g.ctx.mapel === mapel) &&
        (g.ctx.kelas + ' ' + g.ctx.mapel + ' ' + g.ctx.materi).toLowerCase().includes(q.toLowerCase()),
    )
    .sort((a, b) => a.ctx.kelas.localeCompare(b.ctx.kelas) || a.ctx.mapel.localeCompare(b.ctx.mapel) || a.ctx.materi.localeCompare(b.ctx.materi))

  const detail = open ? groupMap.get(open) ?? null : null

  const newFor = (c: Ctx) => setEdit({ ...emptyQuestion('pg'), kelas: c.kelas, mapel: c.mapel, materi: c.materi })
  const valid = !!edit && edit.mapel.trim() !== '' && soalValid(edit)

  const addIcon = (c: Ctx, label: string) => (
    <button className="btn btn-primary btn-sm px-2" aria-label={label} title={label} onClick={() => newFor(c)}>
      <Icon n="plus" s={15} />
    </button>
  )

  const pg = usePagination(groups, [kelas, mapel, q].join('|'))

  return (
    <section>
      {detail ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
            <div className="min-w-0">
              <button className="btn btn-ghost btn-sm mb-2" onClick={() => setOpen(null)}><Icon n="left" s={14} /> Semua materi</button>
              <h1 className="font-display text-2xl font-bold break-words">{detail.ctx.materi || 'Tanpa materi'}</h1>
              <div className="flex flex-wrap gap-1.5 mt-1">
                <span className="chip chip-gray">{detail.ctx.kelas || 'Umum'}</span>
                <span className="chip chip-teal">{detail.ctx.mapel}</span>
                <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{detail.items.length} soal</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-ghost btn-sm" onClick={() => setGrup({ ...detail.ctx })}><Icon n="edit" s={14} /> Ubah kelas, mapel, materi</button>
              {addIcon(detail.ctx, 'Tambah soal ke materi ini')}
            </div>
          </div>

          <Modal open={!!grup} onClose={() => setGrup(null)} title="Ubah kelas, mapel, dan materi">
            {grup && (
              <>
                <p className="text-sm mb-4" style={{ color: 'var(--ink-soft)' }}>
                  Perubahan ini berlaku untuk semua {detail.items.length} soal di materi ini.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Kelas">
                    <input className="input" list="grup-kelas" value={grup.kelas} onChange={(e) => setGrup({ ...grup, kelas: e.target.value })} placeholder="kosongkan = umum" />
                  </Field>
                  <Field label="Mapel">
                    <input className="input" list="grup-mapel" value={grup.mapel} onChange={(e) => setGrup({ ...grup, mapel: e.target.value })} />
                  </Field>
                  <Field label="Materi">
                    <input className="input" value={grup.materi} onChange={(e) => setGrup({ ...grup, materi: e.target.value })} />
                  </Field>
                </div>
                <datalist id="grup-kelas">{kelasList.map((k) => <option key={k} value={k} />)}</datalist>
                <datalist id="grup-mapel">{mapelList.map((m) => <option key={m} value={m} />)}</datalist>
                <div className="flex justify-end gap-2 mt-5">
                  <button className="btn btn-ghost" onClick={() => setGrup(null)}>Batal</button>
                  <button
                    className="btn btn-primary"
                    disabled={!grup.mapel.trim() || !grup.materi.trim()}
                    onClick={() => {
                      const nc = { kelas: grup.kelas.trim(), mapel: grup.mapel.trim(), materi: grup.materi.trim() }
                      renameBankGroup(detail.ctx, nc)
                      setOpen(keyOf(nc))
                      setGrup(null)
                    }}
                  >
                    Simpan perubahan
                  </button>
                </div>
              </>
            )}
          </Modal>

          <div className="space-y-3 md:hidden">
            {detail.items.map((b, i) => (
              <div key={b.id} className="card p-4 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-semibold" style={{ color: 'var(--ink-soft)' }}>Soal {i + 1}</span>
                  <span className="chip chip-teal">{TIPE[b.tipe]}</span>
                </div>
                <p className="text-sm break-words whitespace-pre-line">{b.text}</p>
                <dl className="grid grid-cols-2 gap-2 text-xs mt-3" style={{ color: 'var(--ink-soft)' }}>
                  <div><dt>Kunci</dt><dd className="font-bold text-sm" style={{ color: 'var(--ink)' }}>{b.key.map((k) => String.fromCharCode(65 + k)).join(', ')}</dd></div>
                  <div><dt>Bobot</dt><dd className="font-bold text-sm tabular-nums" style={{ color: 'var(--ink)' }}>{b.bobot ?? 1}</dd></div>
                </dl>
                <div className="flex justify-end gap-2 mt-3 pt-3 border-t" style={{ borderColor: 'var(--line)' }}>
                  <button className="btn btn-ghost btn-sm" aria-label="Edit soal" onClick={() => setEdit(JSON.parse(JSON.stringify(b)))}><Icon n="edit" s={14} /> Edit</button>
                  <button className="btn btn-danger btn-sm" aria-label="Hapus soal" onClick={() => setDel(b)}><Icon n="trash" s={14} /> Hapus</button>
                </div>
              </div>
            ))}
          </div>

          <div className="card overflow-x-auto hidden md:block">
            <table className="w-full text-sm" style={{ tableLayout: 'fixed', minWidth: 560 }}>
              <thead>
                <tr>
                  <th className="th" style={{ width: '6%' }}>No</th>
                  <th className="th" style={{ width: '40%' }}>Soal</th>
                  <th className="th" style={{ width: '16%' }}>Tipe</th>
                  <th className="th" style={{ width: '10%' }}>Kunci</th>
                  <th className="th" style={{ width: '8%' }}>Bobot</th>
                  <th className="th text-right" style={{ width: '20%' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((b, i) => (
                  <tr key={b.id}>
                    <td className="td tabular-nums">{i + 1}</td>
                    <td className="td break-words">{b.text}</td>
                    <td className="td break-words">{TIPE[b.tipe]}</td>
                    <td className="td font-bold">{b.key.map((k) => String.fromCharCode(65 + k)).join(', ')}</td>
                    <td className="td tabular-nums">{b.bobot ?? 1}</td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        <button className="btn btn-ghost btn-sm px-1.5" aria-label="Edit soal" title="Edit" onClick={() => setEdit(JSON.parse(JSON.stringify(b)))}><Icon n="edit" s={14} /></button>
                        <button className="btn btn-danger btn-sm px-1.5" aria-label="Hapus soal" title="Hapus" onClick={() => setDel(b)}><Icon n="trash" s={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h1 className="font-display text-2xl font-bold">Bank soal</h1>
              <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>{db.bank.length} soal dalam {groupMap.size} materi. Pilih materi untuk melihat soalnya.</p>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-ghost btn-sm" onClick={() => setImp(true)}><Icon n="upload" s={14} /> Impor AIKEN</button>
              {addIcon({ kelas, mapel, materi: '' }, 'Tambah soal')}
            </div>
          </div>

          <div className="card p-4 mb-4 grid gap-3 items-end md:grid-cols-[minmax(0,1fr)_180px_200px_auto]">
            <Field label="Cari materi">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--ink-soft)' }}>
                  <Icon n="search" s={15} />
                </span>
                <input className="input" style={{ paddingLeft: '2.2rem' }} placeholder="Nama materi, mapel, atau kelas…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari materi" />
              </div>
            </Field>
            <Field label="Kelas">
              <select className="input" value={kelas} onChange={(e) => setKelas(e.target.value)} aria-label="Filter kelas">
                <option value="">Semua kelas</option>
                {kelasList.map((k) => <option key={k}>{k}</option>)}
              </select>
            </Field>
            <Field label="Mata pelajaran">
              <select className="input" value={mapel} onChange={(e) => setMapel(e.target.value)} aria-label="Filter mapel">
                <option value="">Semua mapel</option>
                {mapelList.map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <button
              className="btn btn-ghost"
              style={{ visibility: kelas || mapel || q ? 'visible' : 'hidden' }}
              onClick={() => { setKelas(''); setMapel(''); setQ('') }}
              aria-hidden={!(kelas || mapel || q)}
              tabIndex={kelas || mapel || q ? 0 : -1}
            >
              Reset filter
            </button>
          </div>

          {groups.length === 0 ? (
            <div className="card">
              <Empty icon="book" title="Belum ada materi" hint="Tekan ikon + untuk menambah soal pertama, atau simpan dari editor penugasan." />
            </div>
          ) : (
            <>
            <div className="space-y-3 md:hidden">
              {pg.items.map((g) => {
                const c = (k: string) => g.items.filter((x) => x.tipe === k).length
                return (
                  <div key={g.key} className="card p-4 min-w-0">
                    <button className="w-full text-left min-w-0" onClick={() => setOpen(g.key)} aria-label={`Buka materi ${g.ctx.materi || 'tanpa materi'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="chip chip-gray">{g.ctx.kelas || 'Umum'}</span>
                        <span className="text-xs font-bold tabular-nums">{g.items.length} soal</span>
                      </div>
                      <div className="font-semibold mt-2 break-words">{g.ctx.materi || '–'}</div>
                      <div className="text-sm break-words" style={{ color: 'var(--ink-soft)' }}>{g.ctx.mapel}</div>
                      <div className="text-xs mt-1" style={{ color: 'var(--ink-soft)' }}>PG {c('pg')} · PGK {c('pgk')} · B/S {c('bs')} · Isian {c('isian')} · Jodoh {c('jodoh')}</div>
                    </button>
                    <div className="flex justify-end gap-2 mt-3 pt-3 border-t" style={{ borderColor: 'var(--line)' }}>
                      <button className="btn btn-ghost btn-sm" aria-label="Lihat soal" onClick={() => setOpen(g.key)}><Icon n="eye" s={14} /> Lihat</button>
                      <button className="btn btn-primary btn-sm" aria-label="Tambah soal ke materi ini" onClick={() => newFor(g.ctx)}><Icon n="plus" s={14} /> Soal</button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="card md:hidden">{pg.pager}</div>
            <div className="card overflow-x-auto hidden md:block">
              <table className="w-full text-sm" style={{ tableLayout: 'fixed', minWidth: 560 }}>
                <thead>
                  <tr>
                    <th className="th" style={{ width: '16%' }}>Kelas</th>
                    <th className="th" style={{ width: '26%' }}>Mapel</th>
                    <th className="th" style={{ width: '30%' }}>Materi</th>
                    <th className="th hidden md:table-cell" style={{ width: '12%' }}>Komposisi</th>
                    <th className="th" style={{ width: '8%' }}>Soal</th>
                    <th className="th text-right" style={{ width: '8%' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {pg.items.map((g) => {
                    const c = (k: string) => g.items.filter((x) => x.tipe === k).length
                    return (
                      <tr key={g.key} className="cursor-pointer" onClick={() => setOpen(g.key)} style={{ cursor: 'pointer' }}>
                        <td className="td break-words"><span className="chip chip-gray">{g.ctx.kelas || 'Umum'}</span></td>
                        <td className="td break-words">{g.ctx.mapel}</td>
                        <td className="td font-semibold break-words">{g.ctx.materi || '–'}</td>
                        <td className="td hidden md:table-cell text-xs" style={{ color: 'var(--ink-soft)' }}>PG {c('pg')} · PGK {c('pgk')} · B/S {c('bs')} · Isian {c('isian')} · Jodoh {c('jodoh')}</td>
                        <td className="td tabular-nums font-bold">{g.items.length}</td>
                        <td className="td" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <button className="btn btn-ghost btn-sm px-1.5" aria-label="Lihat soal" title="Lihat soal" onClick={() => setOpen(g.key)}><Icon n="eye" s={14} /></button>
                            <button className="btn btn-primary btn-sm px-1.5" aria-label="Tambah soal ke materi ini" title="Tambah soal ke materi ini" onClick={() => newFor(g.ctx)}><Icon n="plus" s={14} /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {pg.pager}
            </div>
            </>
          )}
        </>
      )}

      <AikenBankImport open={imp} onClose={() => setImp(false)} kelasList={kelasList} />
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit && db.bank.some((x) => x.id === edit.id) ? 'Edit soal bank' : 'Tambah soal ke bank'} wide>
        {edit && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="label" htmlFor="bkl">Kelas</label>
                <input id="bkl" list="bank-kelas" className="input" value={edit.kelas} onChange={(e) => setEdit({ ...edit, kelas: e.target.value })} placeholder="kosongkan = umum" />
                <datalist id="bank-kelas">{kelasList.map((k) => <option key={k} value={k} />)}</datalist>
              </div>
              <div>
                <label className="label" htmlFor="bm">Mata pelajaran</label>
                <input id="bm" className="input" value={edit.mapel} onChange={(e) => setEdit({ ...edit, mapel: e.target.value })} placeholder="mis. Pemeliharaan Mesin" />
              </div>
              <div>
                <label className="label" htmlFor="bmt">Materi</label>
                <input id="bmt" className="input" value={edit.materi} onChange={(e) => setEdit({ ...edit, materi: e.target.value })} placeholder="mis. Sistem Pendingin Mesin" />
              </div>
            </div>
            <QuestionCard q={edit} label="Soal" removable={false} onChange={(nq) => setEdit({ ...edit, ...nq })} />
            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost" onClick={() => setEdit(null)}>Batal</button>
              <button className="btn btn-primary" disabled={!valid} onClick={() => { saveBank(edit); setEdit(null) }}>Simpan ke bank</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!del} onClose={() => setDel(null)} title="Hapus soal dari bank?">
        <p className="text-sm">Soal ini dihapus dari bank. Penugasan yang sudah memakai salinannya tidak terpengaruh.</p>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn btn-ghost" onClick={() => setDel(null)}>Batal</button>
          <button className="btn btn-amber" style={{ background: 'var(--red)' }} onClick={() => { removeBank(del!.id); setDel(null) }}>Hapus</button>
        </div>
      </Modal>
    </section>
  )
}

/** Impor soal AIKEN langsung ke bank soal, tanpa membuat penugasan. */
function AikenBankImport({ open, onClose, kelasList }: { open: boolean; onClose: () => void; kelasList: string[] }) {
  const [txt, setTxt] = useState('')
  const [mapel, setMapel] = useState('')
  const [materi, setMateri] = useState('')
  const [kelas, setKelas] = useState('')
  const [err, setErr] = useState('')
  const res = txt.trim() ? parseAiken(txt) : null
  const siap = !!res && res.questions.length > 0 && !!mapel.trim() && !!materi.trim()
  const reset = () => { setTxt(''); setMapel(''); setMateri(''); setKelas(''); setErr('') }
  const tutup = () => { reset(); onClose() }
  const pilihBerkas = async (f: File | undefined) => {
    if (!f) return
    try { setTxt(await bacaBerkasAiken(f)); setErr('') } catch (e) { setErr(e instanceof Error ? e.message : 'Gagal membaca berkas.') }
  }
  const simpan = () => {
    if (!res) return
    for (const q of res.questions) {
      saveBank({ ...q, id: uid('b'), mapel: mapel.trim(), materi: materi.trim(), kelas: kelas.trim() })
    }
    tutup()
  }
  return (
    <Modal open={open} onClose={tutup} title="Impor AIKEN ke bank soal" wide>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Mapel"><input className="input" value={mapel} onChange={(e) => setMapel(e.target.value)} placeholder="mis. Pemeliharaan Mesin" /></Field>
        <Field label="Materi"><input className="input" value={materi} onChange={(e) => setMateri(e.target.value)} placeholder="mis. Sistem Pendingin" /></Field>
        <Field label="Kelas (opsional)"><input list="aiken-kelas" className="input" value={kelas} onChange={(e) => setKelas(e.target.value)} placeholder="kosongkan = umum" /><datalist id="aiken-kelas">{kelasList.map((k) => <option key={k} value={k} />)}</datalist></Field>
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-4 mb-2">
        <label className="btn btn-ghost btn-sm cursor-pointer">
          <Icon n="upload" s={14} /> Pilih berkas .txt
          <input type="file" accept=".txt,.aiken,text/plain" className="sr-only" onChange={(e) => { void pilihBerkas(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>atau tempel teks di bawah</span>
      </div>
      {err && <p className="text-sm mb-2" style={{ color: 'var(--red)' }} role="alert">{err}</p>}
      <textarea className="input font-mono" rows={8} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={'Apa ibukota Indonesia?\nA. Bandung\nB. Jakarta\nANSWER: B'} aria-label="Teks AIKEN" />
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
        <button className="btn btn-ghost" onClick={tutup}>Batal</button>
        <button className="btn btn-primary" disabled={!siap} onClick={simpan}>Simpan {res?.questions.length ?? 0} soal ke bank</button>
      </div>
      {res && (!mapel.trim() || !materi.trim()) && <p className="text-xs mt-2" style={{ color: 'var(--ink-soft)' }}>Isi mapel dan materi sebelum menyimpan.</p>}
    </Modal>
  )
}
