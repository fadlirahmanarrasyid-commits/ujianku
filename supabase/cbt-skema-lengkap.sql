-- =====================================================================
-- CBT Sekolah · SKEMA LENGKAP (satu file, versi 0001–0010)
-- Cara pakai: buka Supabase → SQL Editor → New query → tempel seluruh isi
-- file ini → Run. Jalankan sekali di proyek yang masih kosong.
-- Jika muncul pilihan "Run without RLS / Run and enable RLS", pilih
-- "Run" (RLS sudah diatur oleh file ini).
-- =====================================================================

-- ===== 0001_skema.sql =====
-- =====================================================================
-- CBT Sekolah · 0001 · Skema tabel
-- Urutan: 0001 → 0002 → 0003 (lihat supabase/README.md)
-- =====================================================================

create extension if not exists pgcrypto;

create type peran_t as enum ('guru', 'siswa');
create type tipe_soal_t as enum ('pg', 'pgk', 'bs');
create type status_ujian_t as enum ('berjalan', 'selesai', 'terkunci');

-- Daftar kelas
create table kelas (
  id uuid primary key default gen_random_uuid(),
  nama text not null unique
);

-- Satu baris per pengguna (guru atau siswa), terhubung ke auth.users
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  peran peran_t not null,
  nama text not null,
  nis text unique,
  kelas_id uuid references kelas (id) on delete set null,
  terkunci boolean not null default false,
  sesi_aktif uuid, -- token perangkat yang sah (satu akun satu perangkat)
  created_at timestamptz not null default now(),
  constraint siswa_wajib_identitas check (peran = 'guru' or (nis is not null and kelas_id is not null))
);

create table tugas (
  id uuid primary key default gen_random_uuid(),
  pemilik uuid not null references profiles (id) on delete cascade,
  judul text not null,
  mapel text not null,
  durasi_menit int not null check (durasi_menit between 1 and 600),
  kkm int not null default 75 check (kkm between 0 and 100),
  acak_soal boolean not null default true,
  acak_opsi boolean not null default true,
  maks_pelanggaran int not null default 3 check (maks_pelanggaran between 1 and 10),
  wajib_layar_penuh boolean not null default true,
  kunci_maju boolean not null default false,
  tampil_nilai boolean not null default true,
  aktif boolean not null default false,
  batas_akhir timestamptz,
  created_at timestamptz not null default now()
);
create index tugas_pemilik_idx on tugas (pemilik);

-- Kelas target. Tanpa baris = semua kelas.
create table tugas_kelas (
  tugas_id uuid not null references tugas (id) on delete cascade,
  kelas_id uuid not null references kelas (id) on delete cascade,
  primary key (tugas_id, kelas_id)
);

create table soal (
  id uuid primary key default gen_random_uuid(),
  tugas_id uuid not null references tugas (id) on delete cascade,
  urutan int not null,
  tipe tipe_soal_t not null,
  teks text not null,
  opsi jsonb not null check (
    case when jsonb_typeof(opsi) = 'array' then jsonb_array_length(opsi) between 2 and 5 else false end
  ),
  bobot int not null default 1 check (bobot between 1 and 10),
  gambar_url text
);
create index soal_tugas_idx on soal (tugas_id, urutan);

-- Kunci jawaban dipisah dari soal. Siswa tidak punya akses baca sama sekali.
create table kunci_soal (
  soal_id uuid primary key references soal (id) on delete cascade,
  kunci int[] not null check (cardinality(kunci) >= 1)
);

-- Bank soal pribadi guru
create table bank_soal (
  id uuid primary key default gen_random_uuid(),
  pemilik uuid not null references profiles (id) on delete cascade,
  kelas_id uuid references kelas (id) on delete set null,
  mapel text not null,
  materi text not null default '',
  tipe tipe_soal_t not null,
  teks text not null,
  opsi jsonb not null check (
    case when jsonb_typeof(opsi) = 'array' then jsonb_array_length(opsi) between 2 and 5 else false end
  ),
  kunci int[] not null check (cardinality(kunci) >= 1),
  bobot int not null default 1 check (bobot between 1 and 10),
  gambar_url text,
  created_at timestamptz not null default now()
);
create index bank_pemilik_idx on bank_soal (pemilik);

-- Satu percobaan per siswa per tugas. Waktu dicatat server.
create table percobaan (
  id uuid primary key default gen_random_uuid(),
  tugas_id uuid not null references tugas (id) on delete cascade,
  siswa_id uuid not null references profiles (id) on delete cascade,
  status status_ujian_t not null default 'berjalan',
  mulai_at timestamptz not null default now(),
  selesai_batas timestamptz not null,
  selesai_at timestamptz,
  urutan_soal uuid[] not null,
  urutan_opsi jsonb not null,
  pelanggaran_reset_at timestamptz, -- pelanggaran sebelum waktu ini tidak dihitung lagi
  unique (tugas_id, siswa_id)
);
create index percobaan_siswa_idx on percobaan (siswa_id);

create table jawaban (
  percobaan_id uuid not null references percobaan (id) on delete cascade,
  soal_id uuid not null references soal (id) on delete cascade,
  pilihan int[] not null default '{}',
  ragu boolean not null default false,
  diubah_at timestamptz not null default now(),
  primary key (percobaan_id, soal_id)
);

create table pelanggaran (
  id bigint generated always as identity primary key,
  percobaan_id uuid not null references percobaan (id) on delete cascade,
  tipe text not null,
  catatan text,
  waktu timestamptz not null default now()
);
create index pelanggaran_percobaan_idx on pelanggaran (percobaan_id, waktu);

-- Skor hanya ditulis oleh kirim_ujian. Siswa membaca lewat nilai_saya().
create table nilai (
  percobaan_id uuid primary key references percobaan (id) on delete cascade,
  skor int not null check (skor between 0 and 100),
  dihitung_at timestamptz not null default now()
);


-- ===== 0002_rls.sql =====
-- =====================================================================
-- CBT Sekolah · 0002 · Row Level Security
-- Prinsip: setiap tabel aktif RLS. Siswa tidak pernah menulis langsung;
-- semua perubahan ujian lewat fungsi di 0003. Kunci dan skor tidak bisa
-- dibaca siswa.
-- =====================================================================

-- Fungsi bantu. SECURITY DEFINER agar kebijakan tidak saling memanggil (rekursi).
create or replace function public.peran_saya() returns peran_t
language sql stable security definer set search_path = public as
$$ select peran from profiles where id = auth.uid() $$;

create or replace function public.kelas_saya() returns uuid
language sql stable security definer set search_path = public as
$$ select kelas_id from profiles where id = auth.uid() $$;

create or replace function public.guru_pemilik(p_tugas uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from tugas t where t.id = p_tugas and t.pemilik = auth.uid()) $$;

create or replace function public.siswa_boleh_tugas(p_tugas uuid) returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from tugas t
    where t.id = p_tugas
      and t.aktif
      and (
        not exists (select 1 from tugas_kelas tk where tk.tugas_id = t.id)
        or exists (select 1 from tugas_kelas tk where tk.tugas_id = t.id and tk.kelas_id = kelas_saya())
      )
  )
$$;

-- ---------- kelas
alter table kelas enable row level security;
create policy kelas_baca on kelas for select to authenticated using (true);
create policy kelas_kelola on kelas for all to authenticated
  using (peran_saya() = 'guru') with check (peran_saya() = 'guru');

-- ---------- profiles
alter table profiles enable row level security;
create policy profil_baca on profiles for select to authenticated
  using (id = auth.uid() or peran_saya() = 'guru');
create policy profil_kelola_guru on profiles for all to authenticated
  using (peran_saya() = 'guru') with check (peran_saya() = 'guru');

-- ---------- tugas
alter table tugas enable row level security;
create policy tugas_guru on tugas for all to authenticated
  using (pemilik = auth.uid() and peran_saya() = 'guru')
  with check (pemilik = auth.uid() and peran_saya() = 'guru');
create policy tugas_siswa_baca on tugas for select to authenticated
  using (peran_saya() = 'siswa' and siswa_boleh_tugas(id));

-- ---------- tugas_kelas
alter table tugas_kelas enable row level security;
create policy tugas_kelas_guru on tugas_kelas for all to authenticated
  using (guru_pemilik(tugas_id)) with check (guru_pemilik(tugas_id));
create policy tugas_kelas_siswa on tugas_kelas for select to authenticated
  using (siswa_boleh_tugas(tugas_id));

-- ---------- soal
alter table soal enable row level security;
create policy soal_guru on soal for all to authenticated
  using (guru_pemilik(tugas_id)) with check (guru_pemilik(tugas_id));
create policy soal_siswa_baca on soal for select to authenticated
  using (exists (select 1 from percobaan p where p.tugas_id = soal.tugas_id and p.siswa_id = auth.uid()));

-- ---------- kunci_soal (hanya guru pemilik)
alter table kunci_soal enable row level security;
create policy kunci_guru on kunci_soal for all to authenticated
  using (exists (select 1 from soal s where s.id = kunci_soal.soal_id and guru_pemilik(s.tugas_id)))
  with check (exists (select 1 from soal s where s.id = kunci_soal.soal_id and guru_pemilik(s.tugas_id)));

-- ---------- bank_soal
alter table bank_soal enable row level security;
create policy bank_pemilik on bank_soal for all to authenticated
  using (pemilik = auth.uid() and peran_saya() = 'guru')
  with check (pemilik = auth.uid() and peran_saya() = 'guru');

-- ---------- percobaan (baca saja; tulis lewat fungsi)
alter table percobaan enable row level security;
create policy percobaan_siswa_baca on percobaan for select to authenticated
  using (siswa_id = auth.uid());
create policy percobaan_guru_baca on percobaan for select to authenticated
  using (guru_pemilik(tugas_id));

-- ---------- jawaban (baca saja; tulis lewat simpan_jawaban)
alter table jawaban enable row level security;
create policy jawaban_siswa_baca on jawaban for select to authenticated
  using (exists (select 1 from percobaan p where p.id = jawaban.percobaan_id and p.siswa_id = auth.uid()));
create policy jawaban_guru_baca on jawaban for select to authenticated
  using (exists (select 1 from percobaan p where p.id = jawaban.percobaan_id and guru_pemilik(p.tugas_id)));

-- ---------- pelanggaran (hanya guru yang melihat)
alter table pelanggaran enable row level security;
create policy pelanggaran_guru_baca on pelanggaran for select to authenticated
  using (exists (select 1 from percobaan p where p.id = pelanggaran.percobaan_id and guru_pemilik(p.tugas_id)));

-- ---------- nilai (hanya guru; siswa lewat nilai_saya())
alter table nilai enable row level security;
create policy nilai_guru_baca on nilai for select to authenticated
  using (exists (select 1 from percobaan p where p.id = nilai.percobaan_id and guru_pemilik(p.tugas_id)));


-- ===== 0003_fungsi.sql =====
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


-- ===== 0004_siswa.sql =====
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


-- ===== 0005_gambar.sql =====
-- =====================================================================
-- CBT Sekolah · 0005 · Gambar soal (Supabase Storage)
-- Jalankan setelah 0001–0004.
-- =====================================================================

-- Bucket publik: gambar soal bisa dibuka lewat URL langsung oleh aplikasi.
-- Siapa pun yang memegang URL bisa melihat gambarnya, jadi jangan simpan data rahasia di sini.
insert into storage.buckets (id, name, public)
values ('soal-gambar', 'soal-gambar', true)
on conflict (id) do nothing;

-- Hanya guru yang masuk yang boleh mengunggah. Pembacaan lewat URL publik tidak memerlukan kebijakan.
drop policy if exists soal_gambar_guru_unggah on storage.objects;
create policy soal_gambar_guru_unggah on storage.objects
  for insert to authenticated
  with check (bucket_id = 'soal-gambar' and peran_saya() = 'guru');


-- ===== 0006_lengkap.sql =====
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


-- ===== 0007_izin.sql =====
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

-- Edge Function (kelola-siswa) memakai service_role untuk membuat akun, kelas, dan profil.
-- Service role melewati RLS, tetapi tetap memerlukan hak tabel di level Postgres.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant execute on functions to service_role;


-- ===== 0008_ringkasan_guru.sql =====
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


-- ===== 0009_isian_jodoh.sql =====
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


-- ===== 0010_mapel.sql =====
-- =====================================================================
-- 0010 · Daftar induk mata pelajaran (Pengaturan → Mata pelajaran)
-- Aman dijalankan ulang. Tidak menghapus data yang sudah ada.
-- =====================================================================

-- ---------- tabel daftar mapel milik guru
create table if not exists mapel (
  id uuid primary key default gen_random_uuid(),
  pemilik uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nama text not null check (length(btrim(nama)) between 1 and 100),
  created_at timestamptz not null default now(),
  unique (pemilik, nama)
);

alter table mapel enable row level security;

drop policy if exists mapel_pemilik on mapel;
create policy mapel_pemilik on mapel for all to authenticated
  using (pemilik = auth.uid() and peran_saya() = 'guru')
  with check (pemilik = auth.uid() and peran_saya() = 'guru');

grant select, insert, update, delete on mapel to authenticated;

-- ---------- ubah nama mapel: ikut memperbarui soal bank dan penugasan milik guru ini
create or replace function public.ubah_mapel(p_lama text, p_baru text) returns void
language plpgsql security invoker set search_path = public as
$$
declare
  v_baru text := btrim(p_baru);
  v_lama text := btrim(p_lama);
begin
  if peran_saya() is distinct from 'guru' then
    raise exception 'Hanya guru yang boleh mengubah mata pelajaran.';
  end if;
  if v_baru = '' or length(v_baru) > 100 then
    raise exception 'Nama mata pelajaran tidak valid.';
  end if;
  if v_baru = v_lama then
    return;
  end if;
  update bank_soal set mapel = v_baru where pemilik = auth.uid() and mapel = v_lama;
  update tugas set mapel = v_baru where pemilik = auth.uid() and mapel = v_lama;
  delete from mapel where pemilik = auth.uid() and nama = v_lama;
  insert into mapel (nama) values (v_baru) on conflict (pemilik, nama) do nothing;
end;
$$;

-- ---------- hapus mapel dari daftar: ditolak bila masih dipakai soal atau penugasan
create or replace function public.hapus_mapel(p_nama text) returns void
language plpgsql security invoker set search_path = public as
$$
declare
  v_nama text := btrim(p_nama);
begin
  if peran_saya() is distinct from 'guru' then
    raise exception 'Hanya guru yang boleh menghapus mata pelajaran.';
  end if;
  if exists (select 1 from bank_soal where pemilik = auth.uid() and mapel = v_nama)
     or exists (select 1 from tugas where pemilik = auth.uid() and mapel = v_nama) then
    raise exception 'Mata pelajaran "%" masih dipakai oleh soal atau penugasan.', v_nama;
  end if;
  delete from mapel where pemilik = auth.uid() and nama = v_nama;
end;
$$;

revoke all on function public.ubah_mapel(text, text) from public, anon;
revoke all on function public.hapus_mapel(text) from public, anon;
grant execute on function public.ubah_mapel(text, text) to authenticated;
grant execute on function public.hapus_mapel(text) to authenticated;

