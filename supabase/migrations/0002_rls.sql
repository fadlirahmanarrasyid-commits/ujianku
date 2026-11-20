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
