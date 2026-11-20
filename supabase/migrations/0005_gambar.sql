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
