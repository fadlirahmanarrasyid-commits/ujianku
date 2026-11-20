-- =====================================================================
-- CBT Sekolah · 0006 · Penyelesaian otomatis & daftar pelanggaran
-- Jalankan setelah 0001–0005.
-- =====================================================================

-- Logika penilaian dipisah agar bisa dipakai oleh kirim_ujian dan penyelesaian otomatis.
-- PG dan BS: benar seluruhnya atau salah. PG kompleks (pgk): skor = bobot x max(0, benar - salah) / jumlah kunci.
create or replace function public._kirim_nilai(p percobaan)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_total numeric := 0;
  v_dapat numeric := 0;
  v_benar int;
  v_salah int;
begin
  for r in
    select s.tipe, s.bobot, k.kunci, coalesce(j.pilihan, '{}'::int[]) as pilihan
    from soal s
    join kunci_soal k on k.soal_id = s.id
    left join jawaban j on j.soal_id = s.id and j.percobaan_id = p.id
    where s.tugas_id = p.tugas_id
  loop
    v_total := v_total + r.bobot;
    if r.tipe = 'pgk' then
      select count(*) filter (where x = any (r.kunci)),
             count(*) filter (where not (x = any (r.kunci)))
        into v_benar, v_salah
        from (select distinct unnest(r.pilihan) as x) q;
      v_dapat := v_dapat + r.bobot * greatest(v_benar - v_salah, 0)::numeric / cardinality(r.kunci);
    elsif cardinality(r.pilihan) > 0
       and (select array_agg(x order by x) from unnest(r.pilihan) x)
         = (select array_agg(y order by y) from unnest(r.kunci) y)
    then
      v_dapat := v_dapat + r.bobot;
    end if;
  end loop;

  insert into nilai (percobaan_id, skor, dihitung_at)
  values (p.id, case when v_total = 0 then 0 else round(v_dapat * 100 / v_total)::int end, now())
  on conflict (percobaan_id) do update set skor = excluded.skor, dihitung_at = now();

  update percobaan set status = 'selesai', selesai_at = now() where id = p.id;
end $$;
revoke all on function public._kirim_nilai(percobaan) from public, anon, authenticated;

-- Siswa menekan "Kirim" (perilaku sama seperti sebelumnya).
create or replace function public.kirim_ujian(p_percobaan uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p percobaan%rowtype;
begin
  select * into p from percobaan where id = p_percobaan and siswa_id = auth.uid() for update;
  if not found then
    raise exception 'Percobaan tidak ditemukan.';
  end if;
  if p.status <> 'berjalan' then
    return; -- sudah dikirim atau terkunci: idempoten
  end if;
  perform _kirim_nilai(p);
end $$;

-- Dijalankan terjadwal (pg_cron). Menilai semua ujian yang sudah lewat batas waktu tetapi belum dikirim.
create or replace function public.kirim_ujian_kedaluwarsa() returns int
language plpgsql security definer set search_path = public as $$
declare
  p percobaan%rowtype;
  n int := 0;
begin
  for p in
    select * from percobaan
    where status = 'berjalan' and selesai_batas < now()
    for update skip locked
  loop
    perform _kirim_nilai(p);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.kirim_ujian_kedaluwarsa() from public, anon, authenticated;

-- Siswa melihat daftar pelanggaran miliknya sendiri pada percobaan aktif (setelah reset, hanya yang baru).
create or replace function public.daftar_pelanggaran_saya(p_percobaan uuid)
returns table (waktu timestamptz, tipe text)
language sql stable security definer set search_path = public as $$
  select v.waktu, v.tipe
  from pelanggaran v
  join percobaan p on p.id = v.percobaan_id
  where v.percobaan_id = p_percobaan
    and p.siswa_id = auth.uid()
    and peran_saya() = 'siswa'
    and v.waktu > coalesce(p.pelanggaran_reset_at, '-infinity'::timestamptz)
  order by v.waktu
$$;

-- Jadwal: setiap menit. Jika ekstensi pg_cron belum aktif, langkah ini dilewati;
-- aktifkan lewat Database → Extensions → pg_cron, lalu jalankan ulang file ini.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('ujian-kedaluwarsa', '* * * * *', 'select public.kirim_ujian_kedaluwarsa()');
exception when others then
  raise notice 'Penjadwalan pg_cron dilewati: %', sqlerrm;
end $$;
