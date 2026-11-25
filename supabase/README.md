# CBT Sekolah · Supabase

## 1. Buat proyek
1. Buat proyek di supabase.com, pilih region **Singapore (ap-southeast-1)**.
2. Catat **Project URL** dan **anon key** (Settings → API). Jangan pernah menyalin service role key ke frontend.

## 2. Jalankan skema (SQL Editor, berurutan)
1. `migrations/0001_skema.sql`
2. `migrations/0002_rls.sql`
3. `migrations/0003_fungsi.sql`
4. `migrations/0004_siswa.sql`
5. `migrations/0005_gambar.sql` (bucket Storage untuk gambar soal)
6. `migrations/0006_lengkap.sql` (penilaian otomatis dan daftar pelanggaran)
7. `migrations/0007_izin.sql` (hak akses tabel)
8. `migrations/0008_ringkasan_guru.sql` (ringkasan nilai untuk guru)
9. `migrations/0009_isian_jodoh.sql` (tipe soal **Isian singkat** dan **Menjodohkan**)
10. `migrations/0010_mapel.sql` (daftar induk **mata pelajaran**)

Proyek yang sudah berjalan sebelumnya cukup menjalankan `0009_isian_jodoh.sql` lalu `0010_mapel.sql`. Migrasi ini hanya menambah kolom, tabel, dan fungsi, tidak menghapus data.

Atau jalankan satu file `cbt-skema-lengkap.sql` (versi 0001–0010) untuk proyek yang masih kosong.

## 3. Akun guru
1. Authentication → Users → **Add user** (email guru, sandi kuat).
2. Salin UUID-nya, lalu jalankan:
   ```sql
   insert into profiles (id, peran, nama) values ('<uuid-guru>', 'guru', 'Nama Guru');
   ```

## 4. Akun siswa
- Akun siswa dibuat dari dasbor guru (Siswa → Tambah siswa atau Impor massal) lewat Edge Function `kelola-siswa`. Lihat bagian 7.
- Email internal: `<nis>@sekolah.local`. PIN wajib 6 digit angka.
- Siswa masuk dengan NIS dan PIN.

## 5. Variabel lingkungan
- Salin `.env.example` menjadi `.env.local` untuk pengembangan lokal.
- Di Vercel: Project Settings → Environment Variables → isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`.

## 6. Penyelesaian otomatis (pg_cron)
Migrasi `0006_lengkap.sql` menjadwalkan `kirim_ujian_kedaluwarsa()` setiap menit. Ujian yang sudah lewat batas waktu tetapi belum dikirim akan dinilai otomatis.
- Aktifkan dulu ekstensi di Supabase: **Database → Extensions → pg_cron → Enable**.
- Jika ekstensi belum aktif saat migrasi dijalankan, langkah penjadwalan dilewati (muncul pesan `NOTICE`). Setelah ekstensi aktif, jalankan ulang `0006_lengkap.sql`.

## 7. Edge Function `kelola-siswa`
Fungsi ini juga melayani pergantian NIS siswa (aksi `ubah`). Setelah memperbarui kode, deploy ulang fungsi ini; jika tidak, pergantian NIS di aplikasi akan kembali ke NIS lama setelah data dimuat ulang.
Dipakai untuk menambah, mengubah (nama dan kelas), mengubah PIN, dan menghapus akun siswa. Fungsi ini memakai service role di server, sehingga kuncinya tidak pernah sampai ke peramban.
```bash
supabase functions deploy kelola-siswa
```
Jika `supabase` CLI belum dipasang, buat fungsi lewat dasbor: **Edge Functions → Deploy a new function**, lalu tempel isi `functions/kelola-siswa/index.ts`. Pastikan opsi verifikasi JWT tetap aktif.

## 8. Uji lokal (PostgreSQL biasa, bukan proyek Supabase)
```bash
createdb cbt_uji
psql cbt_uji -f supabase/tests/00_stub_auth_lokal.sql
psql cbt_uji -f supabase/migrations/0001_skema.sql
psql cbt_uji -f supabase/migrations/0002_rls.sql
psql cbt_uji -f supabase/migrations/0003_fungsi.sql
psql cbt_uji -f supabase/migrations/0004_siswa.sql
psql cbt_uji -f supabase/migrations/0006_lengkap.sql
psql cbt_uji -f supabase/migrations/0007_izin.sql
psql cbt_uji -f supabase/migrations/0008_ringkasan_guru.sql
psql cbt_uji -f supabase/migrations/0009_isian_jodoh.sql
psql cbt_uji -f supabase/tests/10_uji_alur.sql
psql cbt_uji -f supabase/migrations/0010_mapel.sql
psql cbt_uji -f supabase/tests/40_uji_isian_jodoh.sql
psql cbt_uji -f supabase/tests/50_uji_mapel.sql
```
Jangan jalankan folder `tests/` di proyek produksi. Versi lengkap uji 0006 ada di `tests/20_uji_0006.sql`.

## Catatan
- Gambar soal disimpan di Storage (bucket `soal-gambar`, publik). Gambar yang sudah tidak dipakai tidak otomatis dihapus.
- Nilai isian: jawaban dianggap benar jika cocok dengan salah satu kunci jawaban (satu kunci per baris). Huruf besar/kecil dan spasi berlebih diabaikan; nilainya all-or-nothing.
- Nilai menjodohkan: setiap pasangan yang benar mendapat poin parsial sesuai jumlah pasangan benar dibagi jumlah pasangan.
- Mata pelajaran: mengganti nama memperbarui soal bank dan penugasan milik guru yang sama. Mapel yang masih dipakai tidak bisa dihapus dari daftar.
- NIS siswa bisa diubah dari dialog Ubah data siswa. Login memakai NIS baru dengan PIN yang sama.
- Belum diuji terhadap proyek Supabase sungguhan. Lakukan uji alur (login guru, tambah siswa, siswa mengerjakan, dan penilaian otomatis) setelah deploy.
