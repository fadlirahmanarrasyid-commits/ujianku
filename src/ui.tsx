import { useEffect, useState, type ReactNode } from 'react'

const P: Record<string, string> = {
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  task: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6M9 13l2 2 4-4',
  chart: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  unlock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.5-2',
  plus: 'M12 5v14M5 12h14',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  check: 'M20 6L9 17l-5-5',
  x: 'M18 6L6 18M6 6l12 12',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  play: 'M6 4l14 8-14 8z',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  upload: 'M4 17v3h16v-3M12 4v12M7 9l5-5 5 5',
  eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5V21h16',
  shuffle: 'M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
}

export function Icon({ n, s = 16, className = '' }: { n: keyof typeof P | string; s?: number; className?: string }) {
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={P[n]} />
    </svg>
  )
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(23,38,43,.55)' }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`card w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} max-h-[92vh] overflow-auto rounded-b-none sm:rounded-b-[10px]`}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b" style={{ borderColor: 'var(--line)' }}>
          <h3 className="font-display text-lg font-bold">{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Tutup">
            <Icon n="x" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{label}</div>
        {hint && <div className="text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className="shrink-0 relative rounded-full transition-colors"
        style={{ width: 42, height: 24, background: on ? 'var(--teal)' : 'var(--line)' }}
      >
        <span className="absolute top-[3px] rounded-full bg-white transition-all" style={{ width: 18, height: 18, left: on ? 21 : 3 }} />
      </button>
    </div>
  )
}

export function Empty({ icon, title, hint, action }: { icon: string; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-12 px-4">
      <div className="mx-auto mb-3 grid place-items-center rounded-full" style={{ width: 48, height: 48, background: 'var(--teal-tint)', color: 'var(--teal)' }}>
        <Icon n={icon} s={22} />
      </div>
      <div className="font-display font-bold text-lg">{title}</div>
      {hint && <p className="text-sm mt-1 max-w-sm mx-auto" style={{ color: 'var(--ink-soft)' }}>{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export const VIOLATION_LABEL: Record<string, string> = {
  tab: 'Pindah tab / aplikasi',
  blur: 'Jendela kehilangan fokus',
  fullscreen: 'Keluar layar penuh',
  salin: 'Salin / tempel / cetak',
  shortcut: 'Pintasan terlarang',
  reload: 'Muat ulang halaman',
  'klik-kanan': 'Klik kanan',
}

export async function enterFS(): Promise<boolean> {
  try {
    if (document.fullscreenElement) return true
    await document.documentElement.requestFullscreen()
    return true
  } catch {
    return false
  }
}

/* ---------- tema warna ---------- */
export type Theme = 'default' | 'zamrud' | 'bluesky' | 'dark'
const THEME_KEY = 'cbt.theme'
const THEMES: Theme[] = ['default', 'zamrud', 'bluesky', 'dark']
export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY) as Theme | null
    return v && THEMES.includes(v) ? v : 'default'
  } catch {
    return 'default'
  }
}
export function applyTheme(t: Theme) {
  if (t !== 'default') document.documentElement.dataset.theme = t
  else delete document.documentElement.dataset.theme
  try {
    localStorage.setItem(THEME_KEY, t)
  } catch {
    /* abaikan */
  }
}
export function ThemeSwitch() {
  const [t, setT] = useState<Theme>(readTheme)
  return (
    <label className="inline-flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--ink-soft)' }}>
      <span className="hidden sm:inline">Tema</span>
      <select
        className="input"
        style={{ width: 'auto', padding: '.3rem .5rem' }}
        value={t}
        aria-label="Pilih tema warna"
        onChange={(e) => {
          const v = e.target.value as Theme
          setT(v)
          applyTheme(v)
        }}
      >
        <option value="default">Tosca</option>
        <option value="zamrud">Zamrud</option>
        <option value="bluesky">Blue Sky</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  )
}
