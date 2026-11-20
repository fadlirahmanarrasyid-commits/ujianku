/* Ekspor tabel ke CSV. Pemisah titik koma (;) agar Excel dengan pengaturan Indonesia langsung membuka kolom.
   Berkas diberi BOM UTF-8 supaya huruf dan nama tetap terbaca. */

function csvCell(v: unknown): string {
  if (typeof v === 'number') return String(v)
  let s = v === null || v === undefined ? '' : String(v)
  // Cegah rumus Excel dari isi sel (mis. =..., +..., -..., @...).
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function namaBerkasAman(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'data'
}

export function tanggalHariIni(): string {
  return new Date().toISOString().slice(0, 10)
}

export function unduhCsv(namaBerkas: string, header: unknown[], baris: unknown[][]): void {
  const isi = [header, ...baris].map((r) => r.map(csvCell).join(';')).join('\r\n')
  const blob = new Blob(['﻿' + isi], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = namaBerkas
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
