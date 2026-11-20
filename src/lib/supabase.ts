import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Hanya anon key yang boleh ada di frontend. Service role key jangan pernah dimasukkan.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * Klien Supabase. Bernilai null bila variabel lingkungan belum diisi,
 * sehingga aplikasi tetap berjalan dengan penyimpanan lokal.
 */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } }) : null

export const supabaseReady = supabase !== null
/** Alamat dan kunci publik untuk uji koneksi di Pengaturan. Kunci service_role tidak pernah ada di sini. */
export const supabaseUrl = (url ?? '').replace(/\/+$/, '')
export const supabaseAnonKey = anonKey ?? ''
