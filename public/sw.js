// Service worker UjianKu: menyimpan kerangka aplikasi agar bisa dibuka saat koneksi putus.
// Permintaan ke domain lain (Supabase, CDN) tidak pernah disimpan, supaya data ujian selalu dari server.
const VERSI = 'ujiankus-v1'
const KERANGKA = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSI)
      .then((c) => c.addAll(KERANGKA))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((kunci) => Promise.all(kunci.filter((k) => k !== VERSI).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Halaman: ambil dari jaringan dulu, cadangan dari cache saat offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const salinan = res.clone()
          caches.open(VERSI).then((c) => c.put('/index.html', salinan))
          return res
        })
        .catch(() => caches.match('/index.html')),
    )
    return
  }

  // Aset (JS, CSS, gambar): dari cache dulu, lalu jaringan.
  e.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req).then((res) => {
        if (res.ok) {
          const salinan = res.clone()
          caches.open(VERSI).then((c) => c.put(req, salinan))
        }
        return res
      }),
    ),
  )
})
