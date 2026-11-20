-- =====================================================================
-- CBT Sekolah · 0007 · Hak akses tabel dan fungsi untuk peran login
-- Jalankan setelah 0001–0006. Aman dijalankan ulang.
-- Tanpa ini, login berhasil tetapi pemuatan data gagal dengan
-- "permission denied for table ...". Keamanan baris tetap dijaga RLS (0002).
-- anon (pengunjung tanpa login) tidak mendapat hak apa pun ke tabel.
-- =====================================================================

grant usage on schema public to authenticated;

-- Tabel: hak dasar. Baris yang boleh dibaca atau diubah ditentukan oleh policy RLS.
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Fungsi RPC (mulai_ujian, simpan_jawaban, kirim_ujian, dll.) dipanggil siswa dan guru.
grant execute on all functions in schema public to authenticated;

-- Fungsi penilaian internal tidak boleh dipanggil langsung oleh peran login.
revoke execute on function public._kirim_nilai(percobaan) from authenticated;
revoke execute on function public.kirim_ujian_kedaluwarsa() from authenticated;

-- Tabel dan fungsi yang dibuat di masa depan ikut mendapat hak yang sama.
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant execute on functions to authenticated;
