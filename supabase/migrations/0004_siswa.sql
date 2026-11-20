-- =====================================================================
-- CBT Sekolah · 0004 · Dukungan sisi siswa
-- Jalankan setelah 0001–0003.
-- =====================================================================

-- Jumlah dan total bobot soal per tugas yang boleh dilihat siswa.
-- Siswa tidak bisa membaca tabel soal sebelum mulai ujian, jadi jumlahnya diambil lewat fungsi ini.
create or replace function public.ringkasan_tugas_siswa()
returns table (tugas_id uuid, jumlah_soal int, total_bobot int)
language sql stable security definer set search_path = public as $$
  select s.tugas_id, count(*)::int, coalesce(sum(s.bobot), 0)::int
  from soal s
  where peran_saya() = 'siswa'
    and siswa_boleh_tugas(s.tugas_id)
  group by s.tugas_id
$$;
