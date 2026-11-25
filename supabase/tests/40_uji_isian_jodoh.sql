-- Uji isian dan menjodohkan (0009). Jalankan setelah 0001–0004, 0006–0009 dan 00_stub_auth_lokal.sql.
\set ON_ERROR_STOP 1
\pset pager off
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-00000000000d'),
  ('00000000-0000-0000-0000-00000000000e'), ('00000000-0000-0000-0000-00000000000f');
insert into kelas (id, nama) values ('00000000-0000-0000-0000-0000000000a1', 'XI TKRO 1');
insert into profiles (id, peran, nama, nis, kelas_id) values
  ('00000000-0000-0000-0000-00000000000a', 'guru', 'Guru', null, null),
  ('00000000-0000-0000-0000-00000000000b', 'siswa', 'S1', '1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000000c', 'siswa', 'S2', '2', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000000d', 'siswa', 'S3', '3', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000000e', 'siswa', 'S4', '4', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000000f', 'siswa', 'S5', '5', '00000000-0000-0000-0000-0000000000a1');
insert into tugas (id, pemilik, judul, mapel, durasi_menit, aktif) values
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000000a', 'Isian dan jodoh', 'Uji', 60, true);
insert into tugas_kelas values ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000a1');

-- b1: isian, bobot 2. b2: menjodohkan 3 pasangan, bobot 4.
-- Pasangan benar: Busi -> Bahan bakar (1), Injektor -> Pendingin (2), Radiator -> Pembakaran (0).
insert into soal (id, tugas_id, urutan, tipe, teks, opsi, bobot, kiri) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f2', 1, 'isian',
   'Sebutkan jenis mesin pada motor bakar?', '[]', 2, null),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000f2', 2, 'jodoh',
   'Pasangkan komponen dengan fungsinya', '["Pembakaran","Bahan bakar","Pendingin"]', 4, '["Busi","Injektor","Radiator"]');
insert into kunci_soal (soal_id, kunci, kunci_teks) values
  ('00000000-0000-0000-0000-0000000000b1', '{}', '{"Mesin pembakaran dalam","Internal combustion engine"}'),
  ('00000000-0000-0000-0000-0000000000b2', '{1,2,0}', '{}');

-- Pembantu uji: mengembalikan DITERIMA atau DITOLAK beserta pesannya.
create function pg_temp.coba(p_p uuid, p_s uuid, p_pil int[], p_teks text) returns text
language plpgsql as $$
begin
  perform simpan_jawaban(p_p, p_s, p_pil, false, p_teks);
  return 'DITERIMA';
exception when others then
  return 'DITOLAK: ' || sqlerrm;
end $$;

-- Skenario nilai
-- S1: isian benar (dengan spasi dan huruf besar berbeda), jodoh 3 benar -> 100
-- S2: isian salah, jodoh 2 dari 3 benar -> 4 x 2/3 = 2,67 -> (2,67/6) = 44
-- S3: isian Inggris benar, jodoh kosong -> 2/6 = 33
-- S4: keduanya salah -> 0
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select mulai_ujian('00000000-0000-0000-0000-0000000000f2') as p1 \gset
select simpan_jawaban(:'p1'::uuid, '00000000-0000-0000-0000-0000000000b1', '{}', false, '  mesin   PEMBAKARAN dalam ');
select simpan_jawaban(:'p1'::uuid, '00000000-0000-0000-0000-0000000000b2', '{1,2,0}', false);
select kirim_ujian(:'p1'::uuid);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select mulai_ujian('00000000-0000-0000-0000-0000000000f2') as p2 \gset
select simpan_jawaban(:'p2'::uuid, '00000000-0000-0000-0000-0000000000b1', '{}', false, 'Pembakaran');
select simpan_jawaban(:'p2'::uuid, '00000000-0000-0000-0000-0000000000b2', '{1,2,-1}', false);
select kirim_ujian(:'p2'::uuid);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
select mulai_ujian('00000000-0000-0000-0000-0000000000f2') as p3 \gset
select simpan_jawaban(:'p3'::uuid, '00000000-0000-0000-0000-0000000000b1', '{}', false, 'Internal Combustion Engine');
select simpan_jawaban(:'p3'::uuid, '00000000-0000-0000-0000-0000000000b2', '{-1,-1,-1}', false);
select kirim_ujian(:'p3'::uuid);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
select mulai_ujian('00000000-0000-0000-0000-0000000000f2') as p4 \gset
select simpan_jawaban(:'p4'::uuid, '00000000-0000-0000-0000-0000000000b1', '{}', false, 'mesin');
select simpan_jawaban(:'p4'::uuid, '00000000-0000-0000-0000-0000000000b2', '{0,1,2}', false);
select kirim_ujian(:'p4'::uuid);

-- Validasi jawaban: S5 belum mengirim, hanya dicoba
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
select mulai_ujian('00000000-0000-0000-0000-0000000000f2') as p5 \gset
select pg_temp.coba(:'p5'::uuid, '00000000-0000-0000-0000-0000000000b1', '{0}', 'x') as v1_isian_dengan_pilihan;
select pg_temp.coba(:'p5'::uuid, '00000000-0000-0000-0000-0000000000b1', '{}', repeat('a', 1001)) as v2_teks_terlalu_panjang;
select pg_temp.coba(:'p5'::uuid, '00000000-0000-0000-0000-0000000000b2', '{1,1,-1}', null) as v3_kanan_dipakai_dua_kali;
select pg_temp.coba(:'p5'::uuid, '00000000-0000-0000-0000-0000000000b2', '{1,2}', null) as v4_jumlah_tidak_sama;
select pg_temp.coba(:'p5'::uuid, '00000000-0000-0000-0000-0000000000b2', '{5,0,1}', null) as v5_di_luar_rentang;
select pg_temp.coba(:'p5'::uuid, '00000000-0000-0000-0000-0000000000b2', '{-1,-1,-1}', null) as v6_belum_dipilih_diterima;
select pg_temp.coba(:'p5'::uuid, '00000000-0000-0000-0000-0000000000b1', '{}', 'Mesin Pembakaran Dalam') as v7_isian_diterima;
reset role;

select 'EXPECT 100 / 44 / 33 / 0' as cek, string_agg(n.skor::text, ' / ' order by n.skor) as skor_terurut
from nilai n join percobaan p on p.id = n.percobaan_id where p.tugas_id = '00000000-0000-0000-0000-0000000000f2';

-- Dasbor guru: jumlah soal benar per siswa (benar = soal yang nilainya penuh)
-- S1 2, S2 0, S3 1, S4 0, S5 1 (sedang mengerjakan)
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select 'EXPECT 0 0 1 1 2' as cek, string_agg(benar::text, ' ' order by benar) as benar_terurut
from ringkasan_guru() where tugas_id = '00000000-0000-0000-0000-0000000000f2';
reset role;
