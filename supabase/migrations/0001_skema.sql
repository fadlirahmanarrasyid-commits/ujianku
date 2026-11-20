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
