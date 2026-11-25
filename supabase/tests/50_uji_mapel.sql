-- Uji daftar mapel (0010). Jalankan setelah 0001–0010 dan 00_stub_auth_lokal.sql.
\set ON_ERROR_STOP 1
\pset pager off
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');
insert into profiles (id, peran, nama, nis, kelas_id) values
  ('00000000-0000-0000-0000-00000000000a', 'guru', 'Guru A', null, null),
  ('00000000-0000-0000-0000-00000000000b', 'guru', 'Guru B', null, null);
insert into tugas (id, pemilik, judul, mapel, durasi_menit, aktif) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', 'T1', 'Kelistrikan', 60, true);
insert into bank_soal (id, pemilik, tipe, teks, opsi, kunci, mapel, materi) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'pg', 'Soal 1', '["a","b"]', '{0}', 'Kelistrikan', 'Aki'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000b', 'pg', 'Soal B', '["a","b"]', '{0}', 'Kelistrikan', 'Aki');
insert into mapel (pemilik, nama) values
  ('00000000-0000-0000-0000-00000000000a', 'Kelistrikan'),
  ('00000000-0000-0000-0000-00000000000a', 'Pendingin');

grant usage on schema auth to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

-- 1. Guru A tidak bisa menghapus mapel yang dipakai (soal bank / penugasan)
do $$ begin
  begin
    perform hapus_mapel('Kelistrikan');
    raise exception 'GAGAL: hapus mapel yang dipakai seharusnya ditolak';
  exception when others then
    if sqlerrm not like '%masih dipakai%' then raise; end if;
    raise notice 'OK 1: hapus mapel terpakai ditolak';
  end;
end $$;

-- 2. Mapel yang tidak dipakai bisa dihapus
select hapus_mapel('Pendingin');
select 'OK 2: mapel tak terpakai terhapus' as hasil
  where not exists (select 1 from mapel where nama = 'Pendingin');

-- 3. Ubah nama: ikut memperbarui soal bank dan penugasan milik guru A
select ubah_mapel('Kelistrikan', 'Teknik Listrik');
select 'OK 3: ubah nama ikut ke bank dan tugas' as hasil
  where (select count(*) from bank_soal where mapel = 'Teknik Listrik') = 1
    and (select mapel from tugas where id = '00000000-0000-0000-0000-0000000000f1') = 'Teknik Listrik'
    and (select count(*) from bank_soal where mapel = 'Kelistrikan') = 0;

-- 4. Nama kosong atau terlalu panjang ditolak
do $$ begin
  begin
    perform ubah_mapel('Teknik Listrik', '   ');
    raise exception 'GAGAL: nama kosong seharusnya ditolak';
  exception when others then
    if sqlerrm not like '%tidak valid%' then raise; end if;
    raise notice 'OK 4: nama kosong ditolak';
  end;
end $$;

-- 5. Guru B tidak melihat mapel milik guru A dan tidak bisa mengubahnya
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  if (select count(*) from mapel) <> 0 or (select count(*) from bank_soal) <> 1 then
    raise exception 'GAGAL 5: guru B melihat data guru A';
  end if;
  perform ubah_mapel('Teknik Listrik', 'Diambil alih');
  raise notice 'OK 5: isolasi antar guru (baris guru B saja yang terlihat)';
end $$;
reset role;
do $$ begin
  if (select count(*) from bank_soal where pemilik = '00000000-0000-0000-0000-00000000000a' and mapel = 'Teknik Listrik') <> 1 then
    raise exception 'GAGAL 5b: baris guru A ikut berubah';
  end if;
  raise notice 'OK 5b: baris guru A tidak berubah';
end $$;
