-- =====================================================================
-- CBT Sekolah · 0008 · Ringkasan hasil untuk guru (ringan)
-- Jalankan setelah 0001–0007. Aman dijalankan ulang.
-- Dasbor guru tidak lagi mengunduh seluruh jawaban dan pelanggaran.
-- Yang dikirim: ringkasan per percobaan. Daftar pelanggaran diambil saat dibuka.
-- =====================================================================

-- Ringkasan semua percobaan pada penugasan milik guru yang sedang masuk.
create or replace function public.ringkasan_guru()
returns table (
  id uuid, tugas_id uuid, siswa_id uuid, status text,
  mulai_at timestamptz, selesai_batas timestamptz, selesai_at timestamptz,
  urutan_soal uuid[], urutan_opsi jsonb,
  skor int, benar int, jumlah_pelanggaran int
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.tugas_id, p.siswa_id, p.status::text,
    p.mulai_at, p.selesai_batas, p.selesai_at,
    p.urutan_soal, p.urutan_opsi,
    n.skor,
    (
      select count(*)::int
      from soal s
      join kunci_soal k on k.soal_id = s.id
      left join jawaban j on j.soal_id = s.id and j.percobaan_id = p.id
      where s.tugas_id = p.tugas_id
        and coalesce(cardinality(j.pilihan), 0) > 0
        and (select array_agg(distinct x order by x) from unnest(j.pilihan) x)
          = (select array_agg(distinct y order by y) from unnest(k.kunci) y)
    ) as benar,
    (
      select count(*)::int
      from pelanggaran v
      where v.percobaan_id = p.id
        and v.waktu > coalesce(p.pelanggaran_reset_at, '-infinity'::timestamptz)
    ) as jumlah_pelanggaran
  from percobaan p
  left join nilai n on n.percobaan_id = p.id
  where peran_saya() = 'guru' and guru_pemilik(p.tugas_id)
$$;

-- Daftar pelanggaran satu percobaan, hanya untuk guru pemilik penugasan.
create or replace function public.pelanggaran_guru(p_percobaan uuid)
returns table (waktu timestamptz, tipe text, catatan text)
language sql stable security definer set search_path = public as $$
  select v.waktu, v.tipe, v.catatan
  from pelanggaran v
  join percobaan p on p.id = v.percobaan_id
  where v.percobaan_id = p_percobaan
    and peran_saya() = 'guru'
    and guru_pemilik(p.tugas_id)
    and v.waktu > coalesce(p.pelanggaran_reset_at, '-infinity'::timestamptz)
  order by v.waktu
$$;

grant execute on function public.ringkasan_guru() to authenticated;
grant execute on function public.pelanggaran_guru(uuid) to authenticated;
revoke execute on function public.ringkasan_guru() from anon;
revoke execute on function public.pelanggaran_guru(uuid) from anon;
