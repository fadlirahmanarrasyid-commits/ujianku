-- Uji alur ujian dan RLS. Jalankan setelah 0001–0003 dan 00_stub_auth_lokal.sql.
-- Setiap hasil "EXPECT" dicocokkan manual dengan keluaran.
\set ON_ERROR_STOP 1
\pset pager off

-- ---------- data dasar (sebagai superuser)
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),  -- guru
  ('00000000-0000-0000-0000-00000000000b'),  -- siswa kelas A
  ('00000000-0000-0000-0000-00000000000c');  -- siswa kelas B
insert into kelas (id, nama) values
  ('00000000-0000-0000-0000-0000000000a1', 'XI TKRO 1'),
  ('00000000-0000-0000-0000-0000000000a2', 'XI TKRO 2');
insert into profiles (id, peran, nama, nis, kelas_id) values
  ('00000000-0000-0000-0000-00000000000a', 'guru', 'Pak Guru', null, null),
  ('00000000-0000-0000-0000-00000000000b', 'siswa', 'Ahmad', '1001', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000000c', 'siswa', 'Bayu', '2001', '00000000-0000-0000-0000-0000000000a2');
insert into tugas (id, pemilik, judul, mapel, durasi_menit, aktif) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', 'Pendingin', 'Mesin', 15, true);
insert into tugas_kelas values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1');
insert into soal (id, tugas_id, urutan, tipe, teks, opsi, bobot) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', 1, 'pg', 'Termostat?', '["A","B","C","D"]', 1),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000f1', 2, 'pgk', 'Pilih benar?', '["a","b","c","d"]', 2);
insert into kunci_soal values
  ('00000000-0000-0000-0000-0000000000e1', '{1}'),
  ('00000000-0000-0000-0000-0000000000e2', '{0,2}');


-- Pembantu uji: menjalankan SQL yang diharapkan gagal, mengembalikan "OK ditolak" atau "GAGAL".
create or replace function pg_temp.harus_gagal(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return 'GAGAL: seharusnya ditolak -> ' || p_sql;
exception when others then
  return 'OK ditolak: ' || sqlerrm;
end $$;

-- Hak akses untuk peran authenticated (di Supabase sudah otomatis dengan RLS aktif)
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- ---------- 1. Siswa A tidak bisa membaca kunci
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select 'EXPECT 0 — kunci terlihat siswa' as cek, count(*) from kunci_soal;

-- ---------- 2. Siswa B (kelas lain) tidak melihat tugas
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select 'EXPECT 0 — tugas kelas lain terlihat' as cek, count(*) from tugas;

-- ---------- 3. Siswa A melihat tugasnya, lalu mulai ujian
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select 'EXPECT 1 — tugas terlihat' as cek, count(*) from tugas;
select 'EXPECT 0 — soal sebelum mulai' as cek, count(*) from soal;
select mulai_ujian('00000000-0000-0000-0000-0000000000f1') as percobaan_id \gset
select 'EXPECT 2 — soal setelah mulai' as cek, count(*) from soal;
select 'EXPECT 1 — mulai ulang mengembalikan percobaan yang sama' as cek,
       (mulai_ujian('00000000-0000-0000-0000-0000000000f1') = :'percobaan_id'::uuid)::int as sama;

-- ---------- 4. Jawaban: pilihan valid diterima; di luar opsi, dan PG dengan dua jawaban, ditolak
select 'EXPECT tanpa error — jawaban valid' as cek,
       (simpan_jawaban(:'percobaan_id'::uuid, '00000000-0000-0000-0000-0000000000e1', '{1}', false))::text as hasil;
select 'EXPECT OK ditolak — opsi di luar jangkauan' as cek,
       pg_temp.harus_gagal(format('select simpan_jawaban(%L, %L, %L, false)', :'percobaan_id', '00000000-0000-0000-0000-0000000000e1', '{9}')) as hasil;
select 'EXPECT OK ditolak — PG dengan dua jawaban' as cek,
       pg_temp.harus_gagal(format('select simpan_jawaban(%L, %L, %L, false)', :'percobaan_id', '00000000-0000-0000-0000-0000000000e1', '{0,1}')) as hasil;

-- ---------- 5. Pelanggaran: batas 3 mengunci ujian & akun
select catat_pelanggaran(:'percobaan_id'::uuid, 'tab', null) as n1;
select catat_pelanggaran(:'percobaan_id'::uuid, 'blur', null) as n2;
select catat_pelanggaran(:'percobaan_id'::uuid, 'salin', 'Ctrl+C') as n3;
select 'EXPECT terkunci — status percobaan' as cek, status from percobaan where id = :'percobaan_id'::uuid;

-- ---------- 6. Setelah terkunci, jawaban ditolak
select 'EXPECT OK ditolak — jawaban setelah terkunci' as cek,
       pg_temp.harus_gagal(format('select simpan_jawaban(%L, %L, %L, false)', :'percobaan_id', '00000000-0000-0000-0000-0000000000e1', '{0}')) as hasil;

-- ---------- 7. Guru membuka kunci, siswa mulai ulang dari percobaan yang sama
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select buka_kunci('00000000-0000-0000-0000-00000000000b');
select 'EXPECT berjalan — status setelah buka kunci' as cek, status from percobaan where id = :'percobaan_id'::uuid;

-- ---------- 8. Kirim ujian dan nilai: s1 benar (1), s2 benar hanya sebagian (0 saja) -> skor = 1 * 100 / (1+2)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select simpan_jawaban(:'percobaan_id'::uuid, '00000000-0000-0000-0000-0000000000e1', '{1}', false);
select simpan_jawaban(:'percobaan_id'::uuid, '00000000-0000-0000-0000-0000000000e2', '{0}', true);
select kirim_ujian(:'percobaan_id'::uuid);
select 'EXPECT 33 — skor (bobot 1 benar dari 3)' as cek, nilai_skor from nilai_saya();
select 'EXPECT 0 — nilai langsung ke tabel nilai' as cek, count(*) from nilai;

-- ---------- 9. Guru melihat nilai & pelanggaran miliknya
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select 'EXPECT 1 — nilai terlihat guru' as cek, count(*) from nilai;
select 'EXPECT 2 — jawaban terlihat guru' as cek, count(*) from jawaban where percobaan_id = :'percobaan_id'::uuid;

-- ---------- 10. Guru reset ujian: percobaan dan nilai hilang
select reset_ujian(:'percobaan_id'::uuid);
select 'EXPECT 0 — percobaan setelah reset' as cek, count(*) from percobaan;
