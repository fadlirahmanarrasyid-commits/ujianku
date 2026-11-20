import { useState } from 'react'
import { loginGuru, loginGuruRemote, loginSiswa, loginSiswaRemote, remoteOn } from './store'
import { Icon, ThemeSwitch } from './ui'

export default function Login() {
  const [role, setRole] = useState<'siswa' | 'guru'>('siswa')
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (remoteOn) {
      setBusy(true)
      setErr(role === 'guru' ? await loginGuruRemote(a, b) : await loginSiswaRemote(a, b))
      setBusy(false)
      return
    }
    setErr(role === 'guru' ? loginGuru(a, b) : loginSiswa(a, b))
  }
  const demo = (r: 'siswa' | 'guru') => {
    if (r === 'guru') loginGuru('guru', 'guru123')
    else loginSiswa('1002', '1002')
  }

  const points = [
    ['shuffle', 'Soal dan opsi jawaban diacak per siswa'],
    ['shield', 'Layar penuh wajib, pindah tab dicatat'],
    ['lock', 'Akun terkunci otomatis jika melanggar'],
    ['clock', 'Timer tidak bisa dijeda, lanjut walau ditutup'],
  ]

  return (
    <div className="min-h-full grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="px-6 py-8 sm:px-12 sm:py-12 flex flex-col justify-between" style={{ background: 'var(--aside)', color: 'var(--aside-fg)' }}>
        <div className="flex items-center gap-2.5">
          <div className="grid place-items-center rounded-md" style={{ width: 34, height: 34, background: 'var(--amber)', color: 'var(--on-amber)' }}>
            <Icon n="task" s={18} />
          </div>
          <span className="font-display text-xl font-bold tracking-tight">UjianKu</span>
          <span className="chip" style={{ background: 'rgba(255,255,255,.12)', color: 'var(--aside-fg)' }}>CBT</span>
        </div>

        <div className="my-10 lg:my-0 max-w-md">
          <h1 className="font-display font-bold leading-[1.08]" style={{ fontSize: 'clamp(2rem, 4.6vw, 3.1rem)' }}>
            Ujian berbasis komputer yang jujur dan ringan.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed" style={{ color: '#b9c4c6' }}>
            Guru menyusun penugasan, siswa mengerjakan satu soal per layar. Berjalan di browser, tanpa instalasi, cocok untuk laptop sekolah dan HP.
          </p>
          <ul className="mt-7 space-y-3">
            {points.map(([ic, t]) => (
              <li key={t} className="flex items-center gap-3 text-sm">
                <span className="grid place-items-center rounded-md shrink-0" style={{ width: 28, height: 28, background: 'rgba(255,255,255,.08)', color: 'var(--amber)' }}>
                  <Icon n={ic} s={15} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs" style={{ color: '#8fa0a3' }}>Prototipe frontpage · data tersimpan di peramban ini</p>
      </aside>

      <main className="px-6 py-10 sm:px-12 flex items-center">
        <div className="w-full max-w-sm">
          <div className="flex justify-end mb-4"><ThemeSwitch /></div>
          <h2 className="font-display text-2xl font-bold">Masuk</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>Pilih peran Anda untuk melanjutkan.</p>

          <div className="mt-5 grid grid-cols-2 p-1 rounded-lg" style={{ background: 'var(--chip)' }} role="tablist">
            {(['siswa', 'guru'] as const).map((r) => (
              <button
                key={r}
                role="tab"
                aria-selected={role === r}
                onClick={() => {
                  setRole(r)
                  setErr(null)
                  setA('')
                  setB('')
                }}
                className="py-2 rounded-md text-sm font-bold capitalize transition-colors"
                style={role === r ? { background: 'var(--card)', color: 'var(--teal)', boxShadow: '0 1px 2px rgba(0,0,0,.08)' } : { color: 'var(--ink-soft)' }}
              >
                {r}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <label className="label" htmlFor="u">{role === 'guru' ? (remoteOn ? 'Email' : 'Username') : 'NIS'}</label>
              <input id="u" className="input" value={a} onChange={(e) => setA(e.target.value)} autoComplete="username" inputMode={role === 'siswa' ? 'numeric' : 'email'} placeholder={role === 'guru' ? (remoteOn ? 'nama@sekolah.sch.id' : 'guru') : 'mis. 1002'} required />
            </div>
            <div>
              <label className="label" htmlFor="p">{role === 'guru' ? 'Kata sandi' : 'PIN'}</label>
              <input id="p" className="input" type="password" value={b} onChange={(e) => setB(e.target.value)} autoComplete="current-password" required />
            </div>
            {err && (
              <div className="flex items-start gap-2 text-sm rounded-lg px-3 py-2" style={{ background: 'var(--red-tint)', color: 'var(--red)' }} role="alert">
                <Icon n="alert" s={16} className="mt-0.5 shrink-0" />
                {err}
              </div>
            )}
            <button className="btn btn-primary w-full py-2.5" disabled={busy}>{busy ? 'Memeriksa…' : `Masuk sebagai ${role}`}</button>
          </form>

          {!remoteOn && (
            <div className="mt-6 rounded-lg px-3 py-2.5 text-xs" style={{ background: 'var(--amber-tint)', color: 'var(--amber)' }} role="status">
              <b>Mode lokal:</b> aplikasi belum terhubung ke Supabase, jadi akun Supabase Anda tidak bisa dipakai di sini. Di Vercel, pastikan <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_ANON_KEY</code> sudah diisi, lalu lakukan <b>Redeploy</b>.
            </div>
          )}

          {!remoteOn && (
            <div className="mt-6 pt-5 border-t" style={{ borderColor: 'var(--line)' }}>
              <p className="label">Coba cepat (data contoh)</p>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-ghost btn-sm" onClick={() => demo('guru')}>Guru · guru / guru123</button>
                <button className="btn btn-ghost btn-sm" onClick={() => demo('siswa')}>Siswa · 1002 / 1002</button>
              </div>
              <p className="text-xs mt-3" style={{ color: 'var(--ink-soft)' }}>Siswa 1003 sengaja terkunci untuk mencoba fitur buka kunci.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
