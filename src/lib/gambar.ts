// Memilih dan memperkecil gambar soal di peramban.
// Hasilnya berupa data URL JPEG (lebar maks. 800 px, kualitas 0,75), sekitar 100–200 KB per gambar.

export const GAMBAR_MAKS_BYTE = 8 * 1024 * 1024 // batas berkas asli sebelum dikecilkan
const LEBAR_MAKS = 800

export async function pilihGambar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Berkas harus berupa gambar (PNG, JPG, atau WEBP).')
  if (file.size > GAMBAR_MAKS_BYTE) throw new Error('Ukuran gambar maksimal 8 MB.')

  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Gambar tidak bisa dibaca.'))
      el.src = url
    })
    const scale = Math.min(1, LEBAR_MAKS / img.naturalWidth)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Peramban tidak mendukung pengolahan gambar.')
    // PNG transparan diberi latar putih agar tidak menjadi hitam saat dijadikan JPEG
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.75)
  } finally {
    URL.revokeObjectURL(url)
  }
}
