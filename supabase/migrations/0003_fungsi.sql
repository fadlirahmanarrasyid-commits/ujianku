-- =====================================================================
-- CBT Sekolah · 0003 · Fungsi ujian (sisi server)
-- Semua fungsi SECURITY DEFINER dan memeriksa identitas sendiri.
-- =====================================================================

-- ---------- siswa: mulai ujian (acak soal & opsi, waktu dari server)
create or replace function public.mulai_ujian(p_tugas uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t tugas%rowtype;
  v_akun profiles%rowtype;
  p_id uuid;
  v_urut uuid[];
  v_opsi jsonb;
  v_akhir timestamptz;
begin
  if peran_saya() is distinct from 'siswa' then
    raise exception 'Hanya siswa yang dapat mengerjakan ujian.';
  end if;
  select * into v_akun from profiles where id = auth.uid();
  if v_akun.terkunci then
    raise exception 'Akun terkunci. Hubungi guru.';
  end if;
  if not siswa_boleh_tugas(p_tugas) then
    raise exception 'Tugas tidak tersedia untuk Anda.';
  end if;

  -- Sudah pernah mulai: kembalikan percobaan yang ada
  select id into p_id from percobaan where tugas_id = p_tugas and siswa_id = auth.uid();
  if p_id is not null then
    return p_id;
  end if;

  select * into t from tugas where id = p_tugas;
  if t.batas_akhir is not null and now() > t.batas_akhir then
    raise exception 'Ujian sudah ditutup.';
  end if;
  if not exists (select 1 from soal where tugas_id = p_tugas) then
    raise exception 'Tugas ini belum memiliki soal.';
  end if;

  select array_agg(s.id order by case when t.acak_soal then random() else s.urutan end)
    into v_urut
    from soal s where s.tugas_id = p_tugas;

  select jsonb_object_agg(o.soal_id::text, o.urut) into v_opsi
  from (
    select s.id as soal_id,
      (select jsonb_agg(i order by case when t.acak_opsi then random() else i end)
         from generate_series(0, jsonb_array_length(s.opsi) - 1) as i) as urut
    from soal s
    where s.tugas_id = p_tugas
  ) o;

  v_akhir := now() + make_interval(mins => t.durasi_menit);
  if t.batas_akhir is not null and t.batas_akhir < v_akhir then
    v_akhir := t.batas_akhir;
  end if;

  insert into percobaan (tugas_id, siswa_id, status, selesai_batas, urutan_soal, urutan_opsi)
  values (p_tugas, auth.uid(), 'berjalan', v_akhir, v_urut, v_opsi)
  returning id into p_id;

  return p_id;
end $$;

-- ---------- siswa: simpan satu jawaban (dipanggil setiap jawaban berubah)
create or replace function public.simpan_jawaban(
  p_percobaan uuid, p_soal uuid, p_pilihan int[], p_ragu boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare
  p percobaan%rowtype;
  s soal%rowtype;
  v_pil int[] := coalesce(p_pilihan, '{}');
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
  if exists (select 1 from unnest(v_pil) x where x < 0 or x >= jsonb_array_length(s.opsi)) then
    raise exception 'Pilihan jawaban tidak valid.';
  end if;
  if s.tipe <> 'pgk' and cardinality(v_pil) > 1 then
    raise exception 'Soal ini hanya boleh satu jawaban.';
  end if;

  insert into jawaban (percobaan_id, soal_id, pilihan, ragu, diubah_at)
  values (p_percobaan, p_soal, v_pil, coalesce(p_ragu, false), now())
  on conflict (percobaan_id, soal_id) do update
    set pilihan = excluded.pilihan, ragu = excluded.ragu, diubah_at = now();
end $$;

-- ---------- siswa: kirim ujian dan hitung nilai di server
create or replace function public.kirim_ujian(p_percobaan uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  p percobaan%rowtype;
  r record;
  v_total int := 0;
  v_dapat int := 0;
begin
  select * into p from percobaan where id = p_percobaan and siswa_id = auth.uid() for update;
  if not found then
    raise exception 'Percobaan tidak ditemukan.';
  end if;
  if p.status <> 'berjalan' then
    return; -- sudah dikirim atau terkunci: idempoten
  end if;

  for r in
    select s.bobot, k.kunci, j.pilihan
    from soal s
    join kunci_soal k on k.soal_id = s.id
    left join jawaban j on j.soal_id = s.id and j.percobaan_id = p.id
    where s.tugas_id = p.tugas_id
  loop
    v_total := v_total + r.bobot;
    if r.pilihan is not null
       and cardinality(r.pilihan) > 0
       and (select array_agg(x order by x) from unnest(r.pilihan) x)
         = (select array_agg(y order by y) from unnest(r.kunci) y)
    then
      v_dapat := v_dapat + r.bobot;
    end if;
  end loop;

  insert into nilai (percobaan_id, skor, dihitung_at)
  values (p.id, case when v_total = 0 then 0 else round(v_dapat * 100.0 / v_total)::int end, now())
  on conflict (percobaan_id) do update set skor = excluded.skor, dihitung_at = now();

  update percobaan set status = 'selesai', selesai_at = now() where id = p.id;
end $$;

-- ---------- siswa: catat pelanggaran. Mengunci ujian & akun jika mencapai batas.
create or replace function public.catat_pelanggaran(
  p_percobaan uuid, p_tipe text, p_catatan text default null
) returns int
language plpgsql security definer set search_path = public as $$
declare
  p percobaan%rowtype;
  v_maks int;
  v_n int;
begin
  if p_tipe not in ('tab', 'blur', 'fullscreen', 'salin', 'shortcut', 'reload', 'klik-kanan') then
    raise exception 'Jenis pelanggaran tidak dikenal.';
  end if;
  select * into p from percobaan where id = p_percobaan and siswa_id = auth.uid();
  if not found then
    raise exception 'Percobaan tidak ditemukan.';
  end if;
  if p.status <> 'berjalan' then
    return (select count(*)::int from pelanggaran where percobaan_id = p.id);
  end if;

  insert into pelanggaran (percobaan_id, tipe, catatan)
  values (p.id, p_tipe, left(p_catatan, 200));

  select maks_pelanggaran into v_maks from tugas where id = p.tugas_id;
  select count(*)::int into v_n from pelanggaran
    where percobaan_id = p.id
      and waktu > coalesce(p.pelanggaran_reset_at, '-infinity'::timestamptz);

  if v_n >= v_maks then
    update percobaan set status = 'terkunci' where id = p.id;
    update profiles set terkunci = true where id = auth.uid();
  end if;
  return v_n;
end $$;

-- ---------- siswa: tandai sesi perangkat ini sebagai yang sah (login baru menggantikan yang lama)
create or replace function public.klaim_sesi(p_token uuid) returns void
language sql security definer set search_path = public as $$
  update profiles set sesi_aktif = p_token where id = auth.uid() and peran = 'siswa';
$$;

-- ---------- siswa: apakah sesi perangkat ini masih yang sah
create or replace function public.cek_sesi(p_token uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select sesi_aktif = p_token from profiles where id = auth.uid()), false);
$$;

-- ---------- siswa: nilai miliknya sendiri, hanya bila guru mengizinkan
create or replace function public.nilai_saya()
returns table (tugas_ref uuid, nilai_skor int)
language sql stable security definer set search_path = public as $$
  select p.tugas_id, n.skor
  from percobaan p
  join nilai n on n.percobaan_id = p.id
  join tugas t on t.id = p.tugas_id
  where p.siswa_id = auth.uid() and t.tampil_nilai
$$;

-- ---------- guru: reset ujian satu siswa (percobaan, jawaban, nilai, pelanggaran ikut terhapus)
create or replace function public.reset_ujian(p_percobaan uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p percobaan%rowtype;
begin
  select * into p from percobaan where id = p_percobaan;
  if not found or not guru_pemilik(p.tugas_id) then
    raise exception 'Tidak diizinkan.';
  end if;
  delete from percobaan where id = p.id;
  update profiles set terkunci = false where id = p.siswa_id;
end $$;

-- ---------- guru: buka kunci akun dan ujian yang terkunci
create or replace function public.buka_kunci(p_siswa uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if peran_saya() is distinct from 'guru' then
    raise exception 'Tidak diizinkan.';
  end if;
  update profiles set terkunci = false where id = p_siswa;
  update percobaan p
    set status = 'berjalan',
        selesai_batas = greatest(p.selesai_batas, now() + interval '1 minute'),
        pelanggaran_reset_at = now()
    where p.siswa_id = p_siswa
      and p.status = 'terkunci'
      and guru_pemilik(p.tugas_id);
end $$;
