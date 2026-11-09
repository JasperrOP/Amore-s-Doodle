import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useRoom } from '../room/RoomContext'
import { useDialog } from '../../components/DialogContext'
import DoodleImage from '../../components/DoodleImage'
import PageTransition from '../../components/PageTransition'

export default function GalleryPage() {
  const { user } = useAuth()
  const { room, nameOf } = useRoom()
  const { confirm, alert, toast } = useDialog()
  const nav = useNavigate()
  const [items, setItems] = useState(null)
  const [selectedDoodle, setSelectedDoodle] = useState(null)

  const load = async () => {
    const { data } = await supabase
      .from('doodles')
      .select('*')
      .eq('room_id', room.id)
      .order('created_at', { ascending: false })
      .limit(60)
    setItems(data || [])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id])

  const sendToChat = async (d) => {
    const { error } = await supabase.from('messages').insert({ room_id: room.id, sender_id: user.id, doodle_id: d.id })
    if (error) {
      alert({ title: 'Error', message: error.message })
    } else {
      toast('Sent to chat 💌')
      nav('/chat')
    }
  }

  const remove = async (d) => {
    const ok = await confirm({
      title: 'Delete Doodle',
      message: 'Delete this doodle for both of you? This cannot be undone.',
      confirmText: 'Delete',
      danger: true,
    })
    if (!ok) return

    await supabase.storage.from('doodles').remove([d.storage_path])
    await supabase.from('doodles').delete().eq('id', d.id)
    toast('Doodle deleted')
    load()
  }

  if (!items) {
    return (
      <div className="page space-y-3">
        <h1 className="text-2xl font-bold mb-3">Gallery</h1>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card !p-2 space-y-2 animate-pulse">
              <div className="w-full aspect-3/4 rounded-xl" style={{ background: 'var(--line)' }} />
              <div className="h-3 w-2/3 rounded-sm" style={{ background: 'var(--line)' }} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <PageTransition className="page space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Gallery</h1>
        <span className="text-xs muted">{items.length} doodles</span>
      </div>

      {items.length === 0 && (
        <div className="card text-center py-10 space-y-3">
          <div className="text-5xl">🎨</div>
          <h2 className="text-lg font-bold">No saved doodles yet</h2>
          <p className="muted text-sm max-w-xs mx-auto">
            Draw something sweet together on the shared canvas and tap Save to add it to your private gallery!
          </p>
          <Link to="/canvas" className="btn inline-flex no-underline mt-2">
            Go to Shared Canvas
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {items.map((d) => (
          <div key={d.id} className="card !p-2 flex flex-col justify-between">
            <button
              type="button"
              className="block w-full focus:outline-hidden"
              onClick={() => setSelectedDoodle(d.storage_path)}
            >
              <DoodleImage path={d.storage_path} className="w-full rounded-xl hover:opacity-95 transition-opacity" />
            </button>
            <div className="text-[11px] muted mt-1.5 px-0.5 truncate">
              {nameOf(d.creator_id)} · {new Date(d.created_at).toLocaleDateString()}
            </div>
            <div className="flex gap-1.5 mt-2">
              <button
                type="button"
                className="btn !min-h-[40px] !px-3 text-xs flex-1"
                onClick={() => sendToChat(d)}
              >
                Send 💌
              </button>
              {d.creator_id === user.id && (
                <button
                  type="button"
                  className="btn btn-ghost !min-h-[40px] !px-3 text-sm shrink-0"
                  onClick={() => remove(d)}
                  title="Delete doodle"
                  aria-label="Delete doodle"
                >
                  🗑
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Full Size Modal */}
      {selectedDoodle && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4"
          onClick={() => setSelectedDoodle(null)}
        >
          <div className="max-w-md w-full relative" onClick={(e) => e.stopPropagation()}>
            <DoodleImage path={selectedDoodle} className="w-full rounded-2xl shadow-2xl" />
            <button
              type="button"
              className="btn btn-ghost absolute top-2 right-2 !min-h-[36px] !px-3 !bg-black/50 !text-white !border-none"
              onClick={() => setSelectedDoodle(null)}
            >
              ✕ Close
            </button>
          </div>
        </div>
      )}
    </PageTransition>
  )
}
