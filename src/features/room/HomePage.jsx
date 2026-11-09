import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useRoom } from './RoomContext'
import { useDialog } from '../../components/DialogContext'
import PageTransition from '../../components/PageTransition'

const tiles = [
  { to: '/canvas', emoji: '🎨', label: 'Shared Canvas', sub: 'Draw together, live' },
  { to: '/chat', emoji: '💌', label: 'Chat', sub: 'Just the two of you' },
  { to: '/gallery', emoji: '🖼️', label: 'Gallery', sub: 'Saved doodles' },
  { to: '/guess', emoji: '🎲', label: 'Guess My Drawing', sub: 'Draw & guess together' },
]

export default function HomePage() {
  const { profile } = useAuth()
  const { room, partner, refresh, isPartnerOnline } = useRoom()
  const { toast, alert } = useDialog()
  const [invite, setInvite] = useState('')
  const [inviteExpiry, setInviteExpiry] = useState(null)
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (fn) => {
    setBusy(true)
    setErr('')
    try {
      await fn()
    } catch (e) {
      setErr(e.message)
      alert({ title: 'Error', message: e.message })
    } finally {
      setBusy(false)
    }
  }

  const createRoom = () =>
    run(async () => {
      const { error } = await supabase.rpc('create_room', { room_name: 'Our Doodle' })
      if (error) throw error
      await refresh()
      toast('Private room created!')
    })

  const joinRoom = () =>
    run(async () => {
      const { error } = await supabase.rpc('join_room', { invite_code: code })
      if (error) throw error
      await refresh()
      toast('Joined room!')
    })

  const makeInvite = () =>
    run(async () => {
      const { data, error } = await supabase.rpc('create_invite', { rid: room.id })
      if (error) throw error
      setInvite(data)
      const expiry = new Date(Date.now() + 48 * 60 * 60 * 1000)
      setInviteExpiry(expiry)
      toast('Invite code generated!')
    })

  const copyInvite = () => {
    const text = `Join me on Amore's Doodle: ${location.origin} — code ${invite}`
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
      toast('Invite message copied!')
    } else {
      toast(`Code: ${invite}`)
    }
  }

  if (!room) {
    return (
      <PageTransition className="page space-y-4">
        <h1 className="text-2xl font-bold">Hi {profile?.display_name || 'there'} 👋</h1>
        <div className="card space-y-3">
          <h2 className="text-lg font-bold">Start your private room</h2>
          <p className="muted text-sm">Create a room, then send the invite code to your person.</p>
          <button className="btn w-full" onClick={createRoom} disabled={busy}>
            {busy ? 'Creating…' : 'Create Room'}
          </button>
        </div>

        <div className="card space-y-3">
          <h2 className="text-lg font-bold">Have an invite code?</h2>
          <input
            className="input uppercase tracking-widest font-mono text-center text-lg"
            placeholder="ABCDE12345"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={12}
          />
          <button
            className="btn btn-ghost w-full"
            onClick={joinRoom}
            disabled={busy || !code.trim()}
          >
            {busy ? 'Joining…' : 'Join Room'}
          </button>
        </div>

        {err && <p className="text-sm text-center" style={{ color: 'var(--danger)' }}>{err}</p>}
      </PageTransition>
    )
  }

  return (
    <PageTransition className="page space-y-4">
      <div>
        <h1 className="text-3xl font-bold">{room.name}</h1>
        <div className="muted flex items-center gap-1.5 mt-1 text-sm">
          {partner ? (
            <>
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ background: isPartnerOnline ? '#16a34a' : 'var(--muted)' }}
              />
              <span className="font-medium">You & {partner.display_name}</span>
              <span className="text-xs">({isPartnerOnline ? 'online' : 'offline'})</span>
            </>
          ) : (
            <span>Waiting for your person to join…</span>
          )}
        </div>
      </div>

      {!partner && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm">Invite Your Partner</h2>
            <span className="text-xs muted">Single-use · 48h expiry</span>
          </div>

          {invite ? (
            <div className="space-y-3">
              <div
                className="py-3 px-4 rounded-xl text-center select-all border"
                style={{ background: 'var(--paper)', borderColor: 'var(--line)' }}
              >
                <div className="text-3xl font-mono tracking-widest font-bold">{invite}</div>
                {inviteExpiry && (
                  <div className="text-[11px] muted mt-1">
                    Expires {inviteExpiry.toLocaleDateString()} at{' '}
                    {inviteExpiry.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button className="btn flex-1" onClick={copyInvite}>
                  📋 Copy Invite Message
                </button>
                <button
                  className="btn btn-ghost !px-3"
                  onClick={makeInvite}
                  disabled={busy}
                  title="Generate a new code"
                >
                  🔄
                </button>
              </div>
            </div>
          ) : (
            <button className="btn w-full" onClick={makeInvite} disabled={busy}>
              {busy ? 'Generating…' : 'Generate Invite Code'}
            </button>
          )}
        </div>
      )}

      {/* Feature Tiles */}
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className="card block no-underline transition-transform active:scale-98 hover:shadow-sm"
            style={{ color: 'inherit' }}
          >
            <div className="text-3xl">{t.emoji}</div>
            <div className="font-bold mt-2 text-base">{t.label}</div>
            <div className="muted text-xs mt-0.5">{t.sub}</div>
          </Link>
        ))}
      </div>

      {err && <p className="text-sm text-center" style={{ color: 'var(--danger)' }}>{err}</p>}
    </PageTransition>
  )
}
