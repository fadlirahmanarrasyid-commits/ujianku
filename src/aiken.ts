import type { Question, QType } from './types'
import { uid } from './store'

/**
 * Format AIKEN:
 *   Teks soal
 *   A. opsi
 *   B. opsi
 *   C. opsi
 *   D. opsi
 *   ANSWER: C
 * Soal dipisah baris kosong (opsional). Untuk pilihan ganda kompleks tulis banyak kunci: ANSWER: A,C
 * Opsi "Benar" dan "Salah" (berurutan) otomatis menjadi soal Benar/Salah.
 */
interface Draft {
  text: string[]
  opts: string[]
  ans: string
}

export function parseAiken(raw: string): { questions: Question[]; errors: string[] } {
  const out: Question[] = []
  const errors: string[] = []
  let cur: Draft | null = null
  const label = (d: Draft) => (d.text.join(' ').slice(0, 40) || '(tanpa teks)') + '…'

  const finish = (d: Draft) => {
    const text = d.text.join(' ').trim()
    if (!text) return void errors.push('Ada blok soal tanpa teks pertanyaan.')
    if (d.opts.length < 2 || d.opts.length > 5)
      return void errors.push(`"${label(d)}" harus memiliki 2–5 opsi (ditemukan ${d.opts.length}).`)
    const keys = d.ans
      .split(/[,\s]+/)
      .filter(Boolean)
      .map((s) => s.toUpperCase().charCodeAt(0) - 65)
    if (!keys.length || keys.some((k) => k < 0 || k >= d.opts.length))
      return void errors.push(`"${label(d)}" memiliki kunci ANSWER tidak valid: "${d.ans}".`)
    const isBS =
      d.opts.length === 2 && d.opts[0].trim().toLowerCase() === 'benar' && d.opts[1].trim().toLowerCase() === 'salah'
    const tipe: QType = isBS ? 'bs' : keys.length > 1 ? 'pgk' : 'pg'
    out.push({
      id: uid('q'),
      tipe,
      text,
      options: d.opts.map((o) => o.trim()),
      key: [...new Set(keys)].sort((a, b) => a - b),
    })
  }

  for (const line of raw.split(/\r?\n/)) {
    const l = line.trim()
    if (!l) continue
    const ans = l.match(/^ANSWER\s*:\s*(.+)$/i)
    if (ans) {
      if (!cur || !cur.opts.length) {
        errors.push(`Baris "${l}" tidak punya soal dan opsi di atasnya.`)
        cur = null
        continue
      }
      cur.ans = ans[1]
      finish(cur)
      cur = null
      continue
    }
    const opt = l.match(/^([A-Ea-e])[.)]\s*(.*)$/)
    if (opt && cur && cur.text.length) {
      cur.opts.push(opt[2])
      continue
    }
    if (cur && cur.opts.length) {
      errors.push(`"${label(cur)}" tidak punya baris ANSWER.`)
      cur = null
    }
    if (!cur) cur = { text: [], opts: [], ans: '' }
    cur.text.push(l)
  }
  if (cur) {
    const d = cur as Draft
    errors.push(d.opts.length ? `"${label(d)}" tidak punya baris ANSWER.` : `"${label(d)}" belum punya opsi.`)
  }
  return { questions: out, errors }
}
