import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useRoom } from '../room/RoomContext'
import { useDialog } from '../../components/DialogContext'
import PageTransition from '../../components/PageTransition'

export default function SettingsPage() {
  const { profile, updateProfile, signOut, user } = useAuth()
  const { room, refresh } = useRoom()
  const { confirm, toast, alert } = useDialog()
  const [name, setName] = useState(profile?.display_name || '')
  const [savingName, setSavingName] = useState(false)

  const isCreator = room?.created_by === user?.id

  const handleSaveName = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setSavingName(true)
    try {
      await updateProfile({ display_name: trimmed })
      toast('Name updated')
    } catch (e) {
      alert({ title: 'Error', message: e.message })
    } finally {
      setSavingName(false)
    }
  }

  const leave = async () => {
    const ok = await confirm({
      title: 'Leave Room',
      message: 'Leave this room? You will lose access to its chat and gallery.',
      confirmText: 'Leave Room',
      danger: true,
    })
    if (!ok) return

    try {
      await supabase.from('room_members').delete().eq('room_id', room.id).eq('user_id', user.id)
      await refresh()
      toast('Left room')
    } catch (e) {
      alert({ title: 'Error', message: e.message })
    }
  }

  const deleteRoom = async () => {
    const ok = await confirm({
      title: 'Delete Room Forever',
      message:
        'Delete this room for both of you? All messages, doodles, checkpoints and game history will be permanently erased.',
      confirmText: 'Delete Room Permanently',
      danger: true,
    })
    if (!ok) return

    try {
      // 1. List and remove storage files
      const { data: doodleFiles } = await supabase
        .from('doodles')
        .select('storage_path')
        .eq('room_id', room.id)

      if (doodleFiles && doodleFiles.length > 0) {
        await supabase
          .storage
          .from('doodles')
          .remove(doodleFiles.map((d) => d.storage_path))
      }

      // 2. Delete room row (cascades to all room tables)
      const { error } = await supabase.from('rooms').delete().eq('id', room.id)
      if (error) throw error

      await refresh()
      toast('Room deleted')
    } catch (e) {
      alert({ title: 'Error', message: e.message })
    }
  }

  return (
    <PageTransition className="page space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Theme Picker */}
      <div className="card space-y-3">
        <h2 className="font-bold text-sm uppercase muted">Theme</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            ['navy', 'Navy & Cream', '#14213D', '#F4EDE0'],
            ['forest', 'Forest & Sand', '#1F3D2B', '#E8DCC4'],
          ].map(([id, label, a, b]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                updateProfile({ theme: id })
                toast(`Theme set to ${label}`)
              }}
              className="rounded-2xl p-3 text-left transition-transform active:scale-95"
              style={{
                background: b,
                color: a,
                border: profile?.theme === id ? `3px solid ${a}` : '1.5px solid var(--line)',
              }}
            >
              <div className="w-8 h-8 rounded-full mb-2 shadow-xs" style={{ background: a }} />
              <div className="text-sm font-bold">{label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Display Name */}
      <div className="card space-y-3">
        <h2 className="font-bold text-sm uppercase muted">Your Name</h2>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="Display name"
        />
        <button
          type="button"
          className="btn btn-ghost w-full"
          onClick={handleSaveName}
          disabled={savingName || !name.trim() || name.trim() === profile?.display_name}
        >
          {savingName ? 'Saving…' : 'Save Name'}
        </button>
      </div>

      {/* Account & Room Actions */}
      <div className="card space-y-3">
        <h2 className="font-bold text-sm uppercase muted">Room & Account</h2>
        <button type="button" className="btn btn-ghost w-full" onClick={signOut}>
          Sign Out
        </button>

        {room && (
          <button type="button" className="btn btn-ghost w-full" onClick={leave}>
            Leave Room
          </button>
        )}

        {room && isCreator && (
          <button
            type="button"
            className="btn btn-danger w-full text-sm"
            onClick={deleteRoom}
          >
            Delete Room (Creator)
          </button>
        )}
      </div>

      <p className="muted text-xs text-center py-2">
        Private access control for two. Not end-to-end encrypted.
      </p>
    </PageTransition>
  )
}
