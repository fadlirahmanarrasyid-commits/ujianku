-- =====================================================================
-- CBT Sekolah · 0009 · Soal isian singkat dan menjodohkan
-- Jalankan setelah 0001–0008. Aman dijalankan ulang.
--
-- isian  : jawaban teks (jawaban.teks). Kunci = daftar jawaban yang diterima (kunci_soal.kunci_teks).
--          Perbandingan tidak peka huruf besar/kecil dan spasi berlebih diabaikan. Nilai penuh atau nol.
-- jodoh  : soal.kiri = daftar item kiri; soal.opsi = daftar item kanan.
--          kunci[i] = indeks item kanan yang benar untuk item kiri ke-i.
--          jawaban.pilihan[i] = indeks kanan yang dipilih untuk item kiri ke-i (-1 = belum dipilih).
--          Nilai parsial: bobot x (jumlah pasangan benar / jumlah pasangan).
-- =====================================================================

-- 1. Tipe soal baru. Nilai enum baru tidak dipakai sebagai literal di DDL dalam file ini,
--    sehingga aman dijalankan di dalam satu transaksi.
alter type tipe_soal_t add value if not exists 'isian';
alter type tipe_soal_t add value if not exists 'jodoh';

-- 2. Kolom baru
alter table soal add column if not exists kiri jsonb;
alter table bank_soal add column if not exists kiri jsonb;
alter table kunci_soal add column if not exists kunci_teks text[] not null default '{}';
alter table bank_soal add column if not exists kunci_teks text[] not null default '{}';
alter table jawaban add column if not exists teks text;

alter table jawaban drop constraint if exists jawaban_teks_check;
alter table jawaban add constraint jawaban_teks_check check (teks is null or length(teks) <= 1000);

-- 3. Constraint: opsi boleh kosong (isian), dan kunci boleh berupa teks saja (isian)
alter table soal drop constraint if exists soal_opsi_check;
alter table soal add constraint soal_opsi_check check (
  jsonb_typeof(opsi) = 'array'
  and jsonb_array_length(opsi) <= 5
  and (jsonb_array_length(opsi) >= 2 or tipe::text not in ('pg', 'pgk', 'bs'))
);

alter table bank_soal drop constraint if exists bank_soal_opsi_check;
alter table bank_soal add constraint bank_soal_opsi_check check (
  jsonb_typeof(opsi) = 'array'
  and jsonb_array_length(opsi) <= 5
  and (jsonb_array_length(opsi) >= 2 or tipe::text not in ('pg', 'pgk', 'bs'))
);

alter table kunci_soal drop constraint if exists kunci_soal_kunci_check;
alter table kunci_soal add constraint kunci_soal_kunci_check check (cardinality(kunci) >= 1 or cardinality(kunci_teks) >= 1);

alter table bank_soal drop constraint if exists bank_soal_kunci_check;
alter table bank_soal add constraint bank_soal_kunci_check check (cardinality(kunci) >= 1 or cardinality(kunci_teks) >= 1);

-- 4. Normalisasi teks jawaban isian: huruf kecil, spasi tunggal, tanpa spasi di ujung.
create or replace function public._norm_teks(t text)
returns text
language sql immutable as $$
  select lower(btrim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g')))
$$;

-- 5. Fraksi nilai satu soal (0–1). Dipakai untuk nilai dan untuk hitungan benar di dasbor.
create or replace function public._fraksi(
  p_tipe text, p_pil int[], p_teks text, p_kunci int[], p_kunci_teks text[]
) returns numeric
language plpgsql immutable as $$
declare
  v_benar int;
  v_salah int;
begin
  if p_tipe = 'pgk' then
    if cardinality(p_kunci) = 0 then return 0; end if;
    select count(*) filter (where x = any (p_kunci)),
           count(*) filter (where not (x = any (p_kunci)))
      into v_benar, v_salah
      from (select distinct unnest(coalesce(p_pil, '{}'::int[])) as x) q;
    return greatest(v_benar - v_salah, 0)::numeric / cardinality(p_kunci);
  elsif p_tipe = 'jodoh' then
    if cardinality(p_kunci) = 0 then return 0; end if;
    select count(*) into v_benar
      from generate_subscripts(p_kunci, 1) i
      where p_pil[i] = p_kunci[i];
    return v_benar::numeric / cardinality(p_kunci);
  elsif p_tipe = 'isian' then
    if _norm_teks(p_teks) = '' then return 0; end if;
    return case when exists (
      select 1 from unnest(coalesce(p_kunci_teks, '{}'::text[])) k
      where _norm_teks(k) <> '' and _norm_teks(k) = _norm_teks(p_teks)
    ) then 1 else 0 end;
  else
    -- pg dan bs: benar seluruhnya atau salah
    return case when cardinality(coalesce(p_pil, '{}'::int[])) > 0
      and (select array_agg(x order by x) from unnest(p_pil) x)
        = (select array_agg(y order by y) from unnest(p_kunci) y)
      then 1 else 0 end;
  end if;
end $$;

-- 6. Penilaian ujian (dipakai kirim_ujian dan penyelesaian otomatis)
create or replace function public._kirim_nilai(p percobaan)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_total numeric := 0;
  v_dapat numeric := 0;
begin
  for r in
    select s.tipe::text as tipe, s.bobot, k.kunci, k.kunci_teks,
           coalesce(j.pilihan, '{}'::int[]) as pilihan, j.teks
    from soal s
    join kunci_soal k on k.soal_id = s.id
    left join jawaban j on j.soal_id = s.id and j.percobaan_id = p.id
    where s.tugas_id = p.tugas_id
  loop
    v_total := v_total + r.bobot;
    v_dapat := v_dapat + r.bobot * _fraksi(r.tipe, r.pilihan, r.teks, r.kunci, r.kunci_teks);
  end loop;

  insert into nilai (percobaan_id, skor, dihitung_at)
  values (p.id, case when v_total = 0 then 0 else round(v_dapat * 100 / v_total)::int end, now())
  on conflict (percobaan_id) do update set skor = excluded.skor, dihitung_at = now();

  update percobaan set status = 'selesai', selesai_at = now() where id = p.id;
end $$;
revoke all on function public._kirim_nilai(percobaan) from public, anon, authenticated;

-- 7. Siswa menyimpan satu jawaban. Ada parameter teks baru untuk isian.
drop function if exists public.simpan_jawaban(uuid, uuid, int[], boolean);

create or replace function public.simpan_jawaban(
  p_percobaan uuid, p_soal uuid, p_pilihan int[], p_ragu boolean default false, p_teks text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  p percobaan%rowtype;
  s soal%rowtype;
  v_pil int[] := coalesce(p_pilihan, '{}');
  v_teks text := null;
begin
  select * into p from percobaan where id = p_percobaan and siswa_id = auth.uid();
  if not found then
    raise exception 'Percobaan tidak ditemukan.';
  end if;
  if p.status <> 'berjalan' then
    raise exception 'Ujian sudah tidak berjalan.';
  end if;
  if now() > p.selesai_batas then
    raise exception 'Waktu ujian sudah habis.';
  end if;

  select * into s from soal where id = p_soal and tugas_id = p.tugas_id;
  if not found then
    raise exception 'Soal tidak termasuk ujian ini.';
  end if;

  if s.tipe::text = 'isian' then
    if cardinality(v_pil) > 0 then
      raise exception 'Soal isian hanya menerima teks.';
    end if;
    if length(coalesce(p_teks, '')) > 1000 then
      raise exception 'Jawaban terlalu panjang (maksimal 1000 karakter).';
    end if;
    v_teks := nullif(p_teks, '');
    v_pil := '{}';
  elsif s.tipe::text = 'jodoh' then
    if cardinality(v_pil) <> coalesce(jsonb_array_length(s.kiri), 0) then
      raise exception 'Jawaban menjodohkan tidak lengkap.';
    end if;
    if exists (select 1 from unnest(v_pil) x where x < -1 or x >= jsonb_array_length(s.opsi)) then
      raise exception 'Pilihan jawaban tidak valid.';
    end if;
    if exists (select 1 from unnest(v_pil) x where x >= 0 group by x having count(*) > 1) then
      raise exception 'Setiap pilihan kanan hanya boleh dipasangkan sekali.';
    end if;
  else
    if exists (select 1 from unnest(v_pil) x where x < 0 or x >= jsonb_array_length(s.opsi)) then
      raise exception 'Pilihan jawaban tidak valid.';
    end if;
    if s.tipe::text <> 'pgk' and cardinality(v_pil) > 1 then
      raise exception 'Soal ini hanya boleh satu jawaban.';
    end if;
  end if;

  insert into jawaban (percobaan_id, soal_id, pilihan, teks, ragu, diubah_at)
  values (p_percobaan, p_soal, v_pil, v_teks, coalesce(p_ragu, false), now())
  on conflict (percobaan_id, soal_id) do update
    set pilihan = excluded.pilihan, teks = excluded.teks, ragu = excluded.ragu, diubah_at = now();
end $$;

grant execute on function public.simpan_jawaban(uuid, uuid, int[], boolean, text) to authenticated;

-- 8. Dasbor guru: jumlah soal benar per percobaan memakai aturan penilaian yang sama.
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
        and _fraksi(s.tipe::text, coalesce(j.pilihan, '{}'::int[]), j.teks, k.kunci, k.kunci_teks) = 1
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
