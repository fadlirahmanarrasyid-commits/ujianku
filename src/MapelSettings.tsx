import { useState, type FormEvent } from 'react'
import { daftarMapel, hapusMapel, pemakaianMapel, tambahMapel, ubahMapel, useDB } from './store'
import { Icon } from './ui'

type Msg = { ok: boolean; text: string } | null

/** Pengaturan → Mata pelajaran: daftar induk mapel yang dipakai di bank soal dan penugasan. */
export function MapelSettings() {
  useDB() // memicu render ulang bila data berubah
  const daftar = daftarMapel()
  const [baru, setBaru] = useState('')
  const [edit, setEdit] = useState<{ lama: string; nilai: string } | null>(null)
  const [msg, setMsg] = useState<Msg>(null)

  const tambah = (e: FormEvent) => {
    e.preventDefault()
    const v = baru.trim()
    const galat = tambahMapel(v)
    if (galat) return setMsg({ ok: false, text: galat })
    setBaru('')
    setMsg({ ok: true, text: `"${v}" ditambahkan.` })
  }

  const simpanUbah = () => {
    if (!edit) return
    const galat = ubahMapel(edit.lama, edit.nilai)
    if (galat) return setMsg({ ok: false, text: galat })
    setMsg({ ok: true, text: `Nama diubah menjadi "${edit.nilai.trim()}".` })
    setEdit(null)
  }

  const hapus = (nama: string) => {
    const galat = hapusMapel(nama)
    setMsg(galat ? { ok: false, text: galat } : { ok: true, text: `"${nama}" dihapus dari daftar.` })
  }

  return (
    <div className="card p-5">
      <h2 className="font-display font-bold text-lg">Mata pelajaran</h2>
      <p className="text-sm mt-1 mb-4" style={{ color: 'var(--ink-soft)' }}>
        Daftar ini dipakai di bank soal dan penugasan. Mengganti nama ikut memperbarui soal dan penugasan yang memakai mapel tersebut.
      </p>

      <form onSubmit={tambah} className="flex flex-wrap gap-2 mb-4">
        <label className="sr-only" htmlFor="mapel-baru">Nama mata pelajaran baru</label>
        <input
          id="mapel-baru"
          className="input flex-1 min-w-0"
          value={baru}
          onChange={(e) => { setBaru(e.target.value); setMsg(null) }}
          placeholder="mis. Pemeliharaan Mesin Kendaraan Ringan"
          maxLength={100}
        />
        <button className="btn btn-primary" disabled={!baru.trim()}><Icon n="plus" s={14} /> Tambah</button>
      </form>

      {msg && (
        <p className="text-sm mb-3" role="status" style={{ color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.text}</p>
      )}

      {daftar.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Belum ada mata pelajaran.</p>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
          {daftar.map((m) => {
            const p = pemakaianMapel(m)
            const terpakai = p.soal + p.tugas > 0
            const sedangEdit = edit?.lama === m
            return (
              <li key={m} className="py-3 flex flex-wrap items-center gap-3 justify-between">
                {sedangEdit ? (
                  <form
                    className="flex flex-wrap gap-2 flex-1 min-w-0"
                    onSubmit={(e) => { e.preventDefault(); simpanUbah() }}
                  >
                    <label className="sr-only" htmlFor={`edit-${m}`}>Nama baru untuk {m}</label>
                    <input
                      id={`edit-${m}`}
                      className="input flex-1 min-w-0"
                      value={edit.nilai}
                      maxLength={100}
                      autoFocus
                      onChange={(e) => setEdit({ lama: m, nilai: e.target.value })}
                    />
                    <button className="btn btn-primary btn-sm"><Icon n="check" s={14} /> Simpan</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(null)}>Batal</button>
                  </form>
                ) : (
                  <>
                    <div className="min-w-0">
                      <div className="font-semibold break-words">{m}</div>
                      <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                        {p.soal} soal · {p.tugas} penugasan
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button className="btn btn-ghost btn-sm" aria-label={`Ubah nama ${m}`} onClick={() => setEdit({ lama: m, nilai: m })}>
                        <Icon n="edit" s={13} /> Ubah
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        aria-label={`Hapus ${m}`}
                        disabled={terpakai}
                        title={terpakai ? 'Masih dipakai soal atau penugasan' : 'Hapus dari daftar'}
                        onClick={() => hapus(m)}
                      >
                        <Icon n="trash" s={13} /> Hapus
                      </button>
                    </div>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
