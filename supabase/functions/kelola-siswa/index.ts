// Edge Function: kelola akun siswa (tambah, ubah nama/kelas, ubah PIN, hapus).
// Hanya guru yang sudah masuk yang boleh memanggil. Service role dipakai di server saja.
//
// Deploy (dijalankan oleh pemilik proyek):
//   supabase functions deploy kelola-siswa
// SUPABASE_URL, SUPABASE_ANON_KEY, dan SUPABASE_SERVICE_ROLE_KEY sudah tersedia otomatis di Edge Function.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// Mencari akun login berdasarkan email (dipakai bila akun sudah ada tetapi belum punya profil).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cariAkunByEmail(admin: any, email: string): Promise<{ id: string } | null> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error || !data) return null
    const hit = data.users.find((u: { email?: string }) => (u.email ?? '').toLowerCase() === email.toLowerCase())
    if (hit) return hit
    if (data.users.length < 200) return null
  }
  return null
}

const PIN_OK = /^\d{6}$/
const NIS_OK = /^[A-Za-z0-9._-]{1,30}$/

interface SiswaBaru {
  nama: string
  nis: string
  kelas: string
  pin: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Metode tidak diizinkan.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // 1. Pastikan pemanggil adalah guru yang sedang masuk.
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: me } = await userClient.auth.getUser()
  if (!me.user) return json({ error: 'Belum masuk.' }, 401)
  const { data: prof } = await userClient.from('profiles').select('peran').eq('id', me.user.id).maybeSingle()
  if (prof?.peran !== 'guru') return json({ error: 'Hanya guru yang dapat mengelola siswa.' }, 403)

  // 2. Operasi admin dengan service role.
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  const body = await req.json().catch(() => null)
  if (!body?.action) return json({ error: 'Aksi tidak dikenal.' }, 400)

  const kelasIdOf = async (nama: string): Promise<string> => {
    const clean = nama.trim() || 'Tanpa kelas'
    const { data: found } = await admin.from('kelas').select('id').eq('nama', clean).maybeSingle()
    if (found) return found.id
    const { data: created, error } = await admin.from('kelas').insert({ nama: clean }).select('id').single()
    if (error) throw error
    return created.id
  }

  try {
    switch (body.action) {
      case 'tambah': {
        const list: SiswaBaru[] = Array.isArray(body.siswa) ? body.siswa : []
        let added = 0
        const errors: string[] = []
        for (const s of list) {
          const nis = String(s.nis ?? '').trim()
          const nama = String(s.nama ?? '').trim()
          const pin = String(s.pin ?? '').trim()
          if (!nama || !NIS_OK.test(nis)) {
            errors.push(`${nis || '(kosong)'}: NIS atau nama tidak valid`)
            continue
          }
          if (!PIN_OK.test(pin)) {
            errors.push(`${nis}: PIN harus 6 digit`)
            continue
          }
          const email = `${nis}@sekolah.local`
          let userId: string
          let baru = false
          const { data: created, error } = await admin.auth.admin.createUser({
            email,
            password: pin,
            email_confirm: true,
          })
          if (created?.user) {
            userId = created.user.id
            baru = true
          } else {
            // Akun login sudah ada. Bila belum punya profil (sisa percobaan yang terputus), akun itu dipakai ulang.
            // Bila sudah punya profil, NIS ini memang sudah terdaftar.
            const yatim = /already (been )?registered|already exists/i.test(error?.message ?? '')
              ? await cariAkunByEmail(admin, email)
              : null
            if (!yatim) {
              errors.push(`${nis}: ${error?.message ?? 'gagal membuat akun'}`)
              continue
            }
            const { data: sudahProfil } = await admin.from('profiles').select('id').eq('id', yatim.id).maybeSingle()
            if (sudahProfil) {
              errors.push(`${nis}: NIS sudah terdaftar`)
              continue
            }
            const { error: eSandi } = await admin.auth.admin.updateUserById(yatim.id, { password: pin })
            if (eSandi) {
              errors.push(`${nis}: ${eSandi.message}`)
              continue
            }
            userId = yatim.id
          }
          const kelasId = await kelasIdOf(String(s.kelas ?? ''))
          const { error: e2 } = await admin.from('profiles').insert({
            id: userId,
            peran: 'siswa',
            nama,
            nis,
            kelas_id: kelasId,
          })
          if (e2) {
            if (baru) await admin.auth.admin.deleteUser(userId)
            errors.push(`${nis}: ${e2.message}`)
            continue
          }
          added++
        }
        return json({ added, errors })
      }

      case 'hapus': {
        const id = String(body.id ?? '')
        const { data: target } = await admin.from('profiles').select('peran').eq('id', id).maybeSingle()
        if (target?.peran !== 'siswa') return json({ error: 'Siswa tidak ditemukan.' }, 404)
        const { error } = await admin.auth.admin.deleteUser(id)
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }

      case 'ubah_pin': {
        const id = String(body.id ?? '')
        const pin = String(body.pin ?? '').trim()
        if (!PIN_OK.test(pin)) return json({ error: 'PIN harus 6 digit.' }, 400)
        const { data: target } = await admin.from('profiles').select('peran').eq('id', id).maybeSingle()
        if (target?.peran !== 'siswa') return json({ error: 'Siswa tidak ditemukan.' }, 404)
        const { error } = await admin.auth.admin.updateUserById(id, { password: pin })
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }

      case 'ubah': {
        const id = String(body.id ?? '')
        const nama = String(body.nama ?? '').trim()
        if (!nama || nama.length > 100) return json({ error: 'Nama tidak valid.' }, 400)
        const { data: target } = await admin.from('profiles').select('peran').eq('id', id).maybeSingle()
        if (target?.peran !== 'siswa') return json({ error: 'Siswa tidak ditemukan.' }, 404)
        const kelasId = await kelasIdOf(String(body.kelas ?? ''))
        const { error } = await admin.from('profiles').update({ nama, kelas_id: kelasId }).eq('id', id)
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }

      default:
        return json({ error: 'Aksi tidak dikenal.' }, 400)
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Kesalahan server.' }, 500)
  }
})
