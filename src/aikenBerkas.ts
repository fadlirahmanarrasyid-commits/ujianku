/** Membaca berkas soal AIKEN (.txt). Batas 1 MB agar tidak membebani peramban. */
export async function bacaBerkasAiken(file: File): Promise<string> {
  const namaOk = /\.(txt|aiken|text)$/i.test(file.name) || file.type === 'text/plain'
  if (!namaOk) throw new Error('Pilih berkas .txt berisi soal format AIKEN.')
  if (file.size > 1024 * 1024) throw new Error('Berkas terlalu besar (maksimal 1 MB).')
  const teks = await file.text()
  // Buang BOM (sering muncul dari Notepad di Windows) agar baris pertama tidak rusak.
  return teks.replace(/^﻿/, '')
}
