-- Uji 0006: penyelesaian otomatis ujian kedaluwarsa & daftar pelanggaran siswa.
-- Jalankan setelah 0001–0004, 0006, dan 00_stub_auth_lokal.sql.
\set ON_ERROR_STOP 1
\pset pager off

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c');
insert into kelas (id, nama) values ('00000000-0000-0000-0000-0000000000a1', 'XI TKRO 1');
insert into profiles (id, peran, nama, nis, kelas_id) values
  ('00000000-0000-0000-0000-00000000000a', 'guru', 'Pak Guru', null, null),
  ('00000000-0000-0000-0000-00000000000b', 'siswa', 'Ahmad', '1001', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000000c', 'siswa', 'Bayu', '1002', '00000000-0000-0000-0000-0000000000a1');
insert into tugas (id, pemilik, judul, mapel, durasi_menit, aktif) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', 'Pendingin', 'Mesin', 15, true);
insert into tugas_kelas values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1');
insert into soal (id, tugas_id, urutan, tipe, teks, opsi, bobot) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', 1, 'pg', 'Termostat?', '["A","B","C","D"]', 1),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000f1', 2, 'pgk', 'Pilih benar?', '["a","b","c","d"]', 3);
insert into kunci_soal values
  ('00000000-0000-0000-0000-0000000000e1', '{1}'),
  ('00000000-0000-0000-0000-0000000000e2', '{0,2}');

-- Siswa B mulai, menjawab soal 1 dengan benar, lalu ditinggal.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select mulai_ujian('00000000-0000-0000-0000-0000000000f1') as p_b \gset
select simpan_jawaban(:'p_b'::uuid, '00000000-0000-0000-0000-0000000000e1', '{1}', false);
select catat_pelanggaran(:'p_b'::uuid, 'tab', null) as x1;
select catat_pelanggaran(:'p_b'::uuid, 'blur', null) as x2;

-- Siswa C mulai juga, lalu kirim sendiri (tidak boleh diubah oleh penjadwal).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select mulai_ujian('00000000-0000-0000-0000-0000000000f1') as p_c \gset
select simpan_jawaban(:'p_c'::uuid, '00000000-0000-0000-0000-0000000000e2', '{0,2}', false);
select kirim_ujian(:'p_c'::uuid);

-- Daftar pelanggaran: siswa B melihat miliknya sendiri, siswa C tidak melihat milik B.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select 'EXPECT 2 — pelanggaran milik sendiri' as cek, count(*) from daftar_pelanggaran_saya(:'p_b'::uuid);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select 'EXPECT 0 — pelanggaran milik orang lain' as cek, count(*) from daftar_pelanggaran_saya(:'p_b'::uuid);
reset role;

-- Simulasi: waktu ujian B sudah habis, dan ujian C sudah dikirim (status selesai).
update percobaan set selesai_batas = now() - interval '1 minute' where id = :'p_b'::uuid;
select 'EXPECT berjalan — status B sebelum penjadwal' as cek, status from percobaan where id = :'p_b'::uuid;

-- Penjadwal menilai ujian B (dan hanya itu, karena C sudah selesai).
select 'EXPECT 1 — jumlah ujian dinilai penjadwal' as cek, kirim_ujian_kedaluwarsa() as n;
select 'EXPECT selesai — status B setelah penjadwal' as cek, status from percobaan where id = :'p_b'::uuid;
select 'EXPECT skor 25 (1 dari bobot 1+3, bobot soal 1 saja) — skor B' as cek, skor from nilai where percobaan_id = :'p_b'::uuid;
select 'EXPECT 0 — penjadwal kedua tidak menilai ulang' as cek, kirim_ujian_kedaluwarsa() as n;

-- Pelanggaran sebelum reset tidak ditampilkan lagi.
update percobaan set pelanggaran_reset_at = now() where id = :'p_b'::uuid;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select 'EXPECT 0 — pelanggaran sebelum reset' as cek, count(*) from daftar_pelanggaran_saya(:'p_b'::uuid);
reset role;

-- Ujian yang belum lewat batas tidak disentuh.
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000d');
insert into profiles (id, peran, nama, nis, kelas_id) values
  ('00000000-0000-0000-0000-00000000000d', 'siswa', 'Cici', '1003', '00000000-0000-0000-0000-0000000000a1');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
select mulai_ujian('00000000-0000-0000-0000-0000000000f1') as p_d \gset
reset role;
select 'EXPECT 0 — ujian belum habis tidak dinilai' as cek, kirim_ujian_kedaluwarsa() as n;
select 'EXPECT berjalan — status ujian belum habis' as cek, status from percobaan where id = :'p_d'::uuid;
