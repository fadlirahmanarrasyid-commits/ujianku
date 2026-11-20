import { useEffect, useState } from 'react'
import Login from './Login'
import Teacher from './Teacher'
import Student from './Student'
import { bootRemote, dismissSyncError, remoteOn, useSession, useSyncError } from './store'
import { applyTheme, readTheme } from './ui'

export default function App() {
  const s = useSession()
  const syncError = useSyncError()
  const [ready, setReady] = useState(!remoteOn)

  useEffect(() => {
    applyTheme(readTheme())
    if (remoteOn) void bootRemote().finally(() => setReady(true))
  }, [])

  if (!ready) {
    return (
      <div className="min-h-full grid place-items-center text-sm" style={{ color: 'var(--ink-soft)' }}>
        Memuat data…
      </div>
    )
  }

  const banner = syncError && (
    <div role="alert" className="flex items-start gap-3 px-4 py-2.5 text-sm" style={{ background: 'var(--red-tint)', color: 'var(--red)' }}>
      <span className="flex-1 break-words">Gagal menyimpan ke Supabase. {syncError}</span>
      <button className="btn btn-ghost btn-sm" onClick={dismissSyncError}>Tutup</button>
    </div>
  )

  if (!s)
    return (
      <>
        {banner}
        <Login />
      </>
    )
  if (s.role === 'guru')
    return (
      <>
        {banner}
        <Teacher />
      </>
    )
  return (
    <>
      {banner}
      <Student studentId={s.studentId!} />
    </>
  )
}
