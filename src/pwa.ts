/* Pemasangan aplikasi sebagai PWA. Chrome/Edge/Android memakai tombol pasang otomatis;
   iPhone/iPad (Safari) tidak punya tombol itu, jadi hanya ditampilkan petunjuknya. */

type PromptPasang = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let tertunda: PromptPasang | null = null
const pendengar = new Set<() => void>()
const beritahu = () => pendengar.forEach((f) => f())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    tertunda = e as PromptPasang
    beritahu()
  })
  window.addEventListener('appinstalled', () => {
    tertunda = null
    beritahu()
  })
}

export function sudahTerpasang(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function apakahiOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function bisaPasangOtomatis(): boolean {
  return tertunda !== null
}

/** Menampilkan dialog pasang dari browser. */
export async function pasangAplikasi(): Promise<'diterima' | 'ditolak' | 'tidak-tersedia'> {
  if (!tertunda) return 'tidak-tersedia'
  await tertunda.prompt()
  const { outcome } = await tertunda.userChoice
  tertunda = null
  beritahu()
  return outcome === 'accepted' ? 'diterima' : 'ditolak'
}

export function langgananPwa(f: () => void): () => void {
  pendengar.add(f)
  return () => {
    pendengar.delete(f)
  }
}

/** Mendaftarkan service worker. Hanya di build produksi, agar pengembangan lokal tidak tertahan cache. */
export function daftarServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const daftar = () => navigator.serviceWorker.register('/sw.js').catch(() => {})
  if (document.readyState === 'complete') daftar()
  else window.addEventListener('load', daftar, { once: true })
}
