# UjianKu · CBT Sekolah

Aplikasi ujian berbasis peramban untuk guru dan siswa (React 18 + TypeScript + Vite + Tailwind), dengan database dan login di Supabase.

- Panduan lengkap: `tutorial.html` (paket terpisah) dan `supabase/README.md` untuk bagian database.
- Jalankan lokal: `pnpm install` lalu `pnpm dev`.
- Bangun untuk produksi: `pnpm build`.
- Variabel lingkungan: salin `.env.example` menjadi `.env.local`, lalu isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`.
- Jangan pernah memasukkan `service_role` key ke repositori atau ke variabel `VITE_*`.
