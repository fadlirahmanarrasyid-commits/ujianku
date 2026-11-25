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
