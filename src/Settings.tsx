import { useState } from 'react'
import { changeTeacherPassword, changeTeacherPasswordRemote, remoteOn } from './store'
import { supabaseAnonKey, supabaseUrl } from './lib/supabase'
import { Icon } from './ui'

type Msg = { tone: 'ok' | 'err' | 'muted'; text: string } | null
const TONE = { ok: 'var(--green)', err: 'var(--red)', muted: 'var(--ink-soft)' }

export function Settings() {
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)
  const [pw, setPw] = useState({ old: '', next: '', confirm: '' })
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pwBusy, setPwBusy] = useState(false)

  const host = supabaseUrl ? supabaseUrl.replace(/^https?:\/\//, '') : ''

  const test = async () => {
    if (!remoteOn) return setMsg({ tone: 'err', text: 'Supabase belum dihubungkan. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di .env.local.' })
    setBusy(true)
    setMsg({ tone: 'muted', text: 'Menguji koneksi…' })
    try {
      // Publishable key (sb_publishable_...) bukan JWT: hanya dikirim di header apikey.
      // Header Authorization dikirim hanya untuk anon key berbentuk JWT (diawali eyJ).
      const headers: Record<string, string> = { apikey: supabaseAnonKey }
      if (supabaseAnonKey.startsWith('eyJ')) headers.Authorization = 'Bearer ' + supabaseAnonKey
      const res = await fetch(supabaseUrl + '/rest/v1/', { headers })
      setMsg(res.ok
        ? { tone: 'ok', text: 'Terhubung ke Supabase.' }
        : { tone: 'err', text: `Ditolak (HTTP ${res.status}). Pastikan anon / publishable key berasal dari proyek yang sama dengan URL, dan tidak ada spasi di nilainya.` })
    } catch {
      setMsg({ tone: 'err', text: 'Tidak bisa terhubung. Periksa URL, koneksi internet, atau pembatasan jaringan.' })
    } finally {
      setBusy(false)
    }
  }

  const changePw = async () => {
    setPwBusy(true)
    const err = remoteOn
      ? await changeTeacherPasswordRemote(pw.old, pw.next, pw.confirm)
      : changeTeacherPassword(pw.old, pw.next, pw.confirm)
    setPwBusy(false)
    if (err) return setPwMsg({ ok: false, text: err })
    setPw({ old: '', next: '', confirm: '' })
    setPwMsg({ ok: true, text: 'Sandi guru berhasil diganti.' })
  }

  return (
    <section className="max-w-2xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Pengaturan</h1>
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Koneksi database dan keamanan akun guru.</p>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="font-display font-bold text-lg">Koneksi Supabase</h2>
          <span className={`chip ${remoteOn ? 'chip-green' : 'chip-gray'}`}>{remoteOn ? 'Terhubung' : 'Mode lokal'}</span>
        </div>

        {remoteOn ? (
          <dl className="text-sm space-y-2">
            <div className="flex flex-wrap gap-x-2"><dt style={{ color: 'var(--ink-soft)' }}>Alamat proyek:</dt><dd className="font-mono break-all">{host}</dd></div>
          </dl>
        ) : (
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            Data disimpan di peramban ini. Untuk memakai database bersama, isi <span className="font-mono">VITE_SUPABASE_URL</span> dan <span className="font-mono">VITE_SUPABASE_ANON_KEY</span> di file <span className="font-mono">.env.local</span>, lalu jalankan ulang atau bangun ulang aplikasi.
          </p>
        )}

        <div className="rounded-lg px-3 py-2.5 text-xs mt-4 flex gap-2" style={{ background: 'var(--amber-tint)', color: '#7a4f00' }}>
          <Icon n="alert" s={15} className="mt-0.5 shrink-0" />
          <span>Hanya <b>anon / publishable key</b> yang boleh dipakai di aplikasi. <b>service_role key</b> dan password database jangan pernah dimasukkan ke file aplikasi, karena nilainya bisa dibaca siapa pun yang membuka halaman.</span>
        </div>

        {msg && <p className="text-sm mt-4" style={{ color: TONE[msg.tone] }} role="status">{msg.text}</p>}

        <div className="flex justify-end mt-5">
          <button className="btn btn-ghost" onClick={test} disabled={busy}><Icon n="refresh" s={14} /> Uji koneksi</button>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-display font-bold text-lg mb-4">Sandi guru</h2>
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="pwo">Sandi lama</label>
            <input id="pwo" type="password" className="input" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} autoComplete="current-password" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="pwn">Sandi baru</label>
              <input id="pwn" type="password" className="input" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" placeholder="minimal 8 karakter" />
            </div>
            <div>
              <label className="label" htmlFor="pwc">Ulangi sandi baru</label>
              <input id="pwc" type="password" className="input" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" />
            </div>
          </div>
        </div>
        {pwMsg && <p className="text-sm mt-4" style={{ color: pwMsg.ok ? 'var(--green)' : 'var(--red)' }} role="status">{pwMsg.text}</p>}
        <div className="flex justify-end mt-5">
          <button className="btn btn-primary" onClick={changePw} disabled={pwBusy || !pw.old || !pw.next || !pw.confirm}>{pwBusy ? 'Menyimpan…' : 'Ganti sandi'}</button>
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--ink-soft)' }}>
          {remoteOn
            ? 'Sandi guru dikelola oleh Supabase Auth. Sandi lama diperiksa dulu sebelum sandi diganti.'
            : 'Mode lokal: sandi disimpan di peramban ini. Hubungkan Supabase agar login memakai akun yang sebenarnya.'}
        </p>
      </div>
    </section>
  )
}
