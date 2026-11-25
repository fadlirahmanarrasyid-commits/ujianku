import { useMemo, useState } from 'react'
import { Dashboard } from './Dashboard'
import type { Student } from './types'
import { addStudents, logout, remoteOn, removeStudent, resetAll, unlockStudent, updateStudent, useDB } from './store'
import { Recap, Results, Tasks } from './Tasks'
import { BankPage } from './Bank'
import { Settings } from './Settings'
import { Empty, Icon, Modal, ThemeSwitch, usePagination } from './ui'

type Tab = 'beranda' | 'tugas' | 'siswa' | 'hasil' | 'bank' | 'rekap' | 'pengaturan'

export default function Teacher() {
  const [tab, setTab] = useState<Tab>('beranda')
  const [resultTask, setResultTask] = useState<string>('')
  const tabs: [Tab, string, string][] = [
    ['beranda', 'Beranda', 'chart'],
    ['tugas', 'Penugasan', 'task'],
    ['siswa', 'Siswa', 'users'],
    ['bank', 'Bank soal', 'grid'],
    ['rekap', 'Rekap cetak', 'book'],
    ['pengaturan', 'Pengaturan', 'shield'],
  ]
  return (
    <div className="min-h-full flex flex-col">
      <header className="no-print sticky top-0 z-30 border-b" style={{ background: 'var(--card)', borderColor: 'var(--line)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-nowrap items-center gap-2 sm:gap-3 h-14">
          <div className="flex items-center gap-2 shrink-0">
            <div className="grid place-items-center rounded-md" style={{ width: 28, height: 28, background: 'var(--teal)', color: 'var(--on-teal)' }}>
              <Icon n="task" s={15} />
            </div>
            <span className="font-display font-bold text-lg hidden lg:inline">UjianKu</span>
          </div>
          <nav className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto no-scrollbar" aria-label="Menu guru">
            {tabs.map(([k, l, ic]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                aria-current={tab === k ? 'page' : undefined}
                title={l}
                aria-label={l}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-semibold whitespace-nowrap"
                style={tab === k ? { background: 'var(--teal-tint)', color: 'var(--teal)' } : { color: 'var(--ink-soft)' }}
              >
                <Icon n={ic} s={15} />
                <span className={tab === k ? '' : 'hidden xl:inline'}>{l}</span>
              </button>
            ))}
          </nav>
          <ThemeSwitch />
          <button className="btn btn-ghost btn-sm shrink-0" onClick={logout} aria-label="Keluar" title="Keluar"><Icon n="logout" s={14} /><span className="hidden sm:inline">Keluar</span></button>
        </div>
      </header>

      <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 flex-1">
        {tab === 'beranda' && <Dashboard onGo={(t) => setTab(t)} />}
        {tab === 'tugas' && <Tasks onResults={(id) => { setResultTask(id); setTab('hasil') }} />}
        {tab === 'siswa' && <Students />}
        {tab === 'hasil' && <Results taskId={resultTask} setTaskId={setResultTask} />}
        {tab === 'bank' && <BankPage />}
        {tab === 'rekap' && <Recap />}
        {tab === 'pengaturan' && <Settings />}
      </main>

      <footer className="no-print max-w-6xl w-full mx-auto px-4 sm:px-6 pb-6 text-xs flex justify-between" style={{ color: 'var(--ink-soft)' }}>
        <span>Data contoh tersimpan lokal di peramban.</span>
        <button className="underline" onClick={resetAll}>Kembalikan data contoh</button>
      </footer>
    </div>
  )
}

/* ================================= SISWA ================================= */

function Students() {
  const db = useDB()
  const [q, setQ] = useState('')
  const [kelas, setKelas] = useState('')
  const [add, setAdd] = useState(false)
  const [bulk, setBulk] = useState(false)
  const [del, setDel] = useState<Student | null>(null)
  const [pinFor, setPinFor] = useState<Student | null>(null)
  const [editFor, setEditFor] = useState<Student | null>(null)
  const kelasList = useMemo(() => [...new Set(db.students.map((s) => s.kelas))].sort(), [db.students])
  const rows = db.students.filter((s) => (!kelas || s.kelas === kelas) && (s.nama + s.nis).toLowerCase().includes(q.toLowerCase()))
  const pg = usePagination(rows, [q, kelas].join('|'))

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display text-2xl font-bold">Siswa</h1>
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{db.students.length} siswa terdaftar · {db.students.filter((s) => s.locked).length} akun terkunci</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => setBulk(true)}><Icon n="upload" /> Impor massal</button>
          <button className="btn btn-primary" onClick={() => setAdd(true)}><Icon n="plus" /> Tambah siswa</button>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap gap-2 p-3 border-b" style={{ borderColor: 'var(--line)' }}>
          <input className="input" style={{ maxWidth: 260 }} placeholder="Cari nama atau NIS…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari siswa" />
          <select className="input" style={{ maxWidth: 180 }} value={kelas} onChange={(e) => setKelas(e.target.value)} aria-label="Filter kelas">
            <option value="">Semua kelas</option>
            {kelasList.map((k) => <option key={k}>{k}</option>)}
          </select>
        </div>
        {rows.length === 0 ? (
          <Empty icon="users" title="Tidak ada siswa" hint="Tambahkan siswa atau ubah filter pencarian." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead><tr><th className="th">Nama</th><th className="th">NIS</th><th className="th">Kelas</th><th className="th">Status</th><th className="th text-right">Aksi</th></tr></thead>
              <tbody>
                {pg.items.map((s) => (
                  <tr key={s.id}>
                    <td className="td font-semibold">{s.nama}</td>
                    <td className="td tabular-nums">{s.nis}</td>
                    <td className="td">{s.kelas}</td>
                    <td className="td">{s.locked ? <span className="chip chip-red"><Icon n="lock" s={11} /> Terkunci</span> : <span className="chip chip-green">Aktif</span>}</td>
                    <td className="td">
                      <div className="flex justify-end gap-1.5">
                        {s.locked && <button className="btn btn-amber btn-sm" onClick={() => unlockStudent(s.id)}><Icon n="unlock" s={13} /> Buka kunci</button>}
                        <button className="btn btn-ghost btn-sm" aria-label={`Ubah data ${s.nama}`} onClick={() => setEditFor(s)}><Icon n="edit" s={13} /> Ubah</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setPinFor(s)}><Icon n="refresh" s={13} /> Reset PIN</button>
                        <button className="btn btn-danger btn-sm" aria-label={`Hapus ${s.nama}`} onClick={() => setDel(s)}><Icon n="trash" s={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pg.pager}
      </div>

      {pinFor && <PinDialog key={pinFor.id} s={pinFor} onClose={() => setPinFor(null)} />}
      {editFor && <EditDialog key={editFor.id} s={editFor} kelasList={kelasList} onClose={() => setEditFor(null)} />}
      <AddStudent open={add} onClose={() => setAdd(false)} kelasList={kelasList} />
      <BulkStudents open={bulk} onClose={() => setBulk(false)} />
      <Modal open={!!del} onClose={() => setDel(null)} title="Hapus siswa?">
        <p className="text-sm">{del?.nama} dan seluruh hasil ujiannya akan dihapus.</p>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn btn-ghost" onClick={() => setDel(null)}>Batal</button>
          <button className="btn btn-amber" style={{ background: 'var(--red)' }} onClick={() => { removeStudent(del!.id); setDel(null) }}>Hapus</button>
        </div>
      </Modal>
    </section>
  )
}

function PinDialog({ s, onClose }: { s: Student; onClose: () => void }) {
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(pin)) return setErr('PIN harus terdiri dari 6 digit angka.')
    updateStudent(s.id, { pin, locked: false, failedLogin: 0 })
    onClose()
  }
  return (
    <Modal open onClose={onClose} title={`Reset PIN ${s.nama}`}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>PIN baru berlaku untuk login berikutnya. Akun yang terkunci akan dibuka kembali.</p>
        <div>
          <label className="label" htmlFor="rp">PIN baru (6 digit)</label>
          <input id="rp" className="input tabular-nums" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} autoFocus
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr('') }} />
        </div>
        {err && <p className="text-sm" style={{ color: 'var(--red)' }}>{err}</p>}
        <div className="flex justify-end gap-2 pt-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Batal</button><button className="btn btn-primary">Simpan PIN</button></div>
      </form>
    </Modal>
  )
}

function EditDialog({ s, kelasList, onClose }: { s: Student; kelasList: string[]; onClose: () => void }) {
  const [nama, setNama] = useState(s.nama)
  const [nis, setNis] = useState(s.nis)
  const [kelas, setKelas] = useState(s.kelas)
  const [err, setErr] = useState('')
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!nama.trim()) return setErr('Nama tidak boleh kosong.')
    const n = nis.trim()
    if (!/^[A-Za-z0-9._-]{1,30}$/.test(n)) return setErr('NIS hanya boleh huruf, angka, titik, garis bawah, atau strip (maksimal 30 karakter).')
    const galat = updateStudent(s.id, { nama: nama.trim(), kelas: kelas.trim() || 'Tanpa kelas', nis: n })
    if (galat) return setErr(galat)
    onClose()
  }
  return (
    <Modal open onClose={onClose} title="Ubah data siswa">
      <form onSubmit={submit} className="space-y-3">
        <div><label className="label" htmlFor="en">Nama lengkap</label><input id="en" className="input" value={nama} onChange={(e) => { setNama(e.target.value); setErr('') }} required /></div>
        <div><label className="label" htmlFor="enis">NIS</label><input id="enis" className="input font-mono" value={nis} onChange={(e) => { setNis(e.target.value); setErr('') }} required /></div>
        <div><label className="label" htmlFor="ek">Kelas</label><input id="ek" list="ekls" className="input" value={kelas} onChange={(e) => setKelas(e.target.value)} /><datalist id="ekls">{kelasList.map((k) => <option key={k} value={k} />)}</datalist></div>
        <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>Bila NIS diubah, siswa masuk dengan NIS baru dan PIN yang sama.</p>
        {err && <p className="text-sm" style={{ color: 'var(--red)' }}>{err}</p>}
        <div className="flex justify-end gap-2 pt-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Batal</button><button className="btn btn-primary">Simpan</button></div>
      </form>
    </Modal>
  )
}

function AddStudent({ open, onClose, kelasList }: { open: boolean; onClose: () => void; kelasList: string[] }) {
  const [f, setF] = useState({ nama: '', nis: '', kelas: '', pin: '' })
  const [err, setErr] = useState('')
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const r = addStudents([{ nama: f.nama.trim(), nis: f.nis.trim(), kelas: f.kelas.trim() || 'Tanpa kelas', pin: f.pin.trim() || (remoteOn ? '' : f.nis.trim()) }])
    if (!r.added) return setErr(remoteOn ? 'NIS sudah terdaftar, data belum lengkap, atau PIN bukan 6 digit.' : 'NIS sudah terdaftar atau data belum lengkap.')
    setF({ nama: '', nis: '', kelas: f.kelas, pin: '' })
    setErr('')
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title="Tambah siswa">
      <form onSubmit={submit} className="space-y-3">
        <div><label className="label" htmlFor="sn">Nama lengkap</label><input id="sn" className="input" value={f.nama} onChange={(e) => setF({ ...f, nama: e.target.value })} required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="si">NIS</label><input id="si" className="input" value={f.nis} onChange={(e) => setF({ ...f, nis: e.target.value })} required /></div>
          <div><label className="label" htmlFor="sp">{remoteOn ? 'PIN (6 digit)' : 'PIN (opsional)'}</label><input id="sp" className="input" inputMode="numeric" value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value })} placeholder={remoteOn ? 'wajib 6 digit' : 'default = NIS'} /></div>
        </div>
        <div><label className="label" htmlFor="sk">Kelas</label><input id="sk" list="kls" className="input" value={f.kelas} onChange={(e) => setF({ ...f, kelas: e.target.value })} placeholder="mis. XI TKRO 1" required /><datalist id="kls">{kelasList.map((k) => <option key={k} value={k} />)}</datalist></div>
        {err && <p className="text-sm" style={{ color: 'var(--red)' }}>{err}</p>}
        <div className="flex justify-end gap-2 pt-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Batal</button><button className="btn btn-primary">Simpan</button></div>
      </form>
    </Modal>
  )
}

function BulkStudents({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [txt, setTxt] = useState('')
  const [msg, setMsg] = useState('')
  const run = () => {
    const list = txt
      .split('\n')
      .map((l) => l.split(/[,;\t]/).map((x) => x.trim()))
      .filter((p) => p.length >= 3)
      .map(([nama, nis, kelas, pin]) => ({ nama, nis, kelas, pin: pin || (remoteOn ? '' : nis) }))
    const r = addStudents(list)
    setMsg(`${r.added} siswa ditambahkan${r.skipped ? `, ${r.skipped} dilewati (NIS ganda, data tidak lengkap${remoteOn ? ', atau PIN bukan 6 digit' : ''})` : ''}.`)
    if (r.added) setTxt('')
  }
  return (
    <Modal open={open} onClose={() => { setMsg(''); onClose() }} title="Impor siswa massal" wide>
      <p className="text-sm mb-2" style={{ color: 'var(--ink-soft)' }}>Tempel dari Excel atau ketik satu siswa per baris: <b>Nama, NIS, Kelas, PIN (opsional)</b>.</p>
      <textarea className="input font-mono" rows={8} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={'Gilang Ramadhan, 1007, XI TKRO 1\nHana Safitri, 1008, XI TKRO 2, 8888'} aria-label="Data siswa" />
      {msg && <p className="text-sm mt-2" style={{ color: 'var(--green)' }}>{msg}</p>}
      <div className="flex justify-end gap-2 mt-4"><button className="btn btn-ghost" onClick={() => { setMsg(''); onClose() }}>Tutup</button><button className="btn btn-primary" disabled={!txt.trim()} onClick={run}>Impor</button></div>
    </Modal>
  )
}
