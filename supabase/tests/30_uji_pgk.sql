-- Uji skor PG kompleks (rumus pengurang). Jalankan setelah 0001–0004, 0006, dan 00_stub_auth_lokal.sql.
\set ON_ERROR_STOP 1
\pset pager off
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-00000000000d'),
  ('00000000-0000-0000-0000-00000000000e');
insert into kelas (id, nama) values ('00000000-0000-0000-0000-0000000000a1', 'XI TKRO 1');
insert into profiles (id, peran, nama, nis, kelas_id) values
  ('00000000-0000-0000-0000-00000000000a', 'guru', 'Guru', null, null),
  ('00000000-0000-0000-0000-00000000000b', 'siswa', 'S1', '1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000000c', 'siswa', 'S2', '2', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000000d', 'siswa', 'S3', '3', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000000e', 'siswa', 'S4', '4', '00000000-0000-0000-0000-0000000000a1');
insert into tugas (id, pemilik, judul, mapel, durasi_menit, aktif) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', 'PGK', 'Uji', 60, true);
insert into tugas_kelas values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1');
insert into soal (id, tugas_id, urutan, tipe, teks, opsi, bobot) values
  ('00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000f1', 1, 'pgk', 'Pilih benar?', '["a","b","c","d"]', 3);
insert into kunci_soal values ('00000000-0000-0000-0000-0000000000e9', '{0,2,3}');

-- S1 pilih {0,1}: benar 1, salah 1 -> 0. S2 pilih {0,2}: benar 2 -> 2/3 x 3 = 2 -> 67.
-- S3 pilih {0,1,2,3}: benar 3, salah 1 -> 2/3 x 3 = 2 -> 67. S4 pilih {2,0,3}: benar 3 -> 100.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select mulai_ujian('00000000-0000-0000-0000-0000000000f1') as p1 \gset
select simpan_jawaban(:'p1'::uuid, '00000000-0000-0000-0000-0000000000e9', '{0,1}', false);
select kirim_ujian(:'p1'::uuid);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select mulai_ujian('00000000-0000-0000-0000-0000000000f1') as p2 \gset
select simpan_jawaban(:'p2'::uuid, '00000000-0000-0000-0000-0000000000e9', '{0,2}', false);
select kirim_ujian(:'p2'::uuid);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
select mulai_ujian('00000000-0000-0000-0000-0000000000f1') as p3 \gset
select simpan_jawaban(:'p3'::uuid, '00000000-0000-0000-0000-0000000000e9', '{0,1,2,3}', false);
select kirim_ujian(:'p3'::uuid);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
select mulai_ujian('00000000-0000-0000-0000-0000000000f1') as p4 \gset
select simpan_jawaban(:'p4'::uuid, '00000000-0000-0000-0000-0000000000e9', '{2,0,3}', false);
select kirim_ujian(:'p4'::uuid);
reset role;
select 'EXPECT 0 / 67 / 67 / 100' as cek, string_agg(skor::text, ' / ' order by skor) as skor_terurut from nilai;
