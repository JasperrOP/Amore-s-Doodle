import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useRoom } from '../room/RoomContext'
import { useDialog } from '../../components/DialogContext'
import DoodleImage from '../../components/DoodleImage'
import PageTransition from '../../components/PageTransition'

const PAGE = 40

export default function ChatPage() {
  const { user } = useAuth()
  const { room, partner, nameOf, isPartnerOnline } = useRoom()
  const { alert } = useDialog()
  const [msgs, setMsgs] = useState([])
  const [doodles, setDoodles] = useState({}) // id -> storage_path
  const [text, setText] = useState('')
  const [picker, setPicker] = useState(false)
  const [recent, setRecent] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [partnerTyping, setPartnerTyping] = useState(false)
  const [selectedDoodle, setSelectedDoodle] = useState(null) // for full-size viewing

  const endRef = useRef(null)
  const channelRef = useRef(null)
  const lastTypingTime = useRef(0)
  const typingTimer = useRef(null)

  const loadDoodlePaths = async (rows) => {
    const ids = [...new Set(rows.map((m) => m.doodle_id).filter(Boolean))].filter((i) => !doodles[i])
    if (!ids.length) return
    const { data } = await supabase.from('doodles').select('id, storage_path').in('id', ids)
    setDoodles((d) => ({ ...d, ...Object.fromEntries((data || []).map((x) => [x.id, x.storage_path])) }))
  }

  useEffect(() => {
    let on = true
    supabase
      .from('messages')
      .select('*')
      .eq('room_id', room.id)
      .order('created_at', { ascending: false })
      .limit(PAGE)
      .then(({ data }) => {
        if (!on) return
        const rows = (data || []).reverse()
        setMsgs(rows)
        setHasMore((data || []).length === PAGE)
        loadDoodlePaths(rows)
      })

    const ch = supabase
      .channel(`chat:${room.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${room.id}` },
        ({ new: m }) => {
          setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]))
          loadDoodlePaths([m])
        }
      )
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.userId === partner?.id) {
          if (payload.isTyping) {
            setPartnerTyping(true)
            if (typingTimer.current) clearTimeout(typingTimer.current)
            typingTimer.current = setTimeout(() => setPartnerTyping(false), 3000)
          } else {
            setPartnerTyping(false)
            if (typingTimer.current) clearTimeout(typingTimer.current)
          }
        }
      })
      .subscribe()

    channelRef.current = ch

    return () => {
      on = false
      if (typingTimer.current) clearTimeout(typingTimer.current)
      supabase.removeChannel(ch)
    }
  }, [room.id, partner?.id])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs.length, partnerTyping])

  const handleTextChange = (e) => {
    const val = e.target.value
    setText(val)

    // Broadcast throttled typing event
    const now = Date.now()
    if (now - lastTypingTime.current > 2000 && val.trim().length > 0) {
      lastTypingTime.current = now
      channelRef.current?.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: user.id, isTyping: true },
      })
    } else if (val.trim().length === 0) {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: user.id, isTyping: false },
      })
    }
  }

  const loadOlder = async () => {
    const oldest = msgs[0]?.created_at
    if (!oldest) return
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('room_id', room.id)
      .lt('created_at', oldest)
      .order('created_at', { ascending: false })
      .limit(PAGE)
    const rows = (data || []).reverse()
    setMsgs((c) => [...rows, ...c])
    setHasMore((data || []).length === PAGE)
    loadDoodlePaths(rows)
  }

  const send = async (e, doodleId = null) => {
    e?.preventDefault()
    const body = text.trim()
    if (!body && !doodleId) return
    if (body.length > 2000) {
      alert({ title: 'Message Too Long', message: 'Messages must be 2,000 characters or less.' })
      return
    }

    // Clear typing indicator
    channelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: user.id, isTyping: false },
    })

    setText('')
    setPicker(false)

    const { data, error } = await supabase
      .from('messages')
      .insert({ room_id: room.id, sender_id: user.id, body: body || null, doodle_id: doodleId })
      .select()
      .single()

    if (error) {
      setText(body)
      alert({ title: 'Could Not Send Message', message: error.message })
      return
    }
    setMsgs((cur) => (cur.some((x) => x.id === data.id) ? cur : [...cur, data]))
    loadDoodlePaths([data])
  }

  const openPicker = async () => {
    setPicker(!picker)
    if (!picker) {
      const { data } = await supabase
        .from('doodles')
        .select('id, storage_path')
        .eq('room_id', room.id)
        .order('created_at', { ascending: false })
        .limit(12)
      setRecent(data || [])
    }
  }

  return (
    <PageTransition className="flex flex-col" style={{ height: 'calc(100dvh - 72px)' }}>
      {/* Chat Top Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b shrink-0 z-10 pt-[calc(env(safe-area-inset-top)+.5rem)]"
        style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div
              className="w-9 h-9 rounded-full grid place-items-center font-bold text-sm"
              style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}
            >
              {partner?.display_name?.[0] || '💌'}
            </div>
            <span
              className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2"
              style={{
                background: isPartnerOnline ? '#16a34a' : 'var(--muted)',
                borderColor: 'var(--surface)',
              }}
            />
          </div>
          <div>
            <div className="text-sm font-bold leading-tight">{partner?.display_name || 'Your Partner'}</div>
            <div className="text-[11px] muted">
              {partnerTyping ? (
                <span className="font-semibold" style={{ color: 'var(--primary)' }}>
                  ✍️ typing…
                </span>
              ) : isPartnerOnline ? (
                <span style={{ color: '#16a34a' }}>online</span>
              ) : (
                'offline'
              )}
            </div>
          </div>
        </div>
        <div className="text-xs muted">{room.name}</div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 max-w-xl w-full mx-auto">
        {hasMore && (
          <button className="btn btn-ghost mx-auto block text-xs !min-h-[36px]" onClick={loadOlder}>
            Load older messages
          </button>
        )}
        {msgs.length === 0 && <p className="muted text-center mt-12 text-sm">Say hi to your person 💌</p>}
        {msgs.map((m) => {
          const mine = m.sender_id === user.id
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className="max-w-[80%] px-3.5 py-2.5 rounded-2xl shadow-2xs"
                style={{
                  background: mine ? 'var(--primary)' : 'var(--surface)',
                  color: mine ? 'var(--on-primary)' : 'var(--ink)',
                  border: mine ? 0 : '1px solid var(--line)',
                }}
              >
                {!mine && <div className="text-[11px] opacity-75 font-semibold mb-0.5">{nameOf(m.sender_id)}</div>}
                {m.doodle_id && doodles[m.doodle_id] && (
                  <button
                    type="button"
                    onClick={() => setSelectedDoodle(doodles[m.doodle_id])}
                    className="block rounded-xl overflow-hidden mb-1 focus:outline-hidden"
                  >
                    <DoodleImage path={doodles[m.doodle_id]} className="rounded-xl w-56 max-w-full" />
                  </button>
                )}
                {m.body && <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.body}</div>}
                <div className="text-[10px] opacity-60 text-right mt-0.5">
                  {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          )
        })}

        {partnerTyping && (
          <div className="flex justify-start">
            <div
              className="px-3 py-1.5 rounded-2xl text-xs muted italic"
              style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
            >
              {partner?.display_name || 'Partner'} is typing…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Attach Doodle Picker Drawer */}
      {picker && (
        <div
          className="flex gap-2 overflow-x-auto p-2 border-t shrink-0"
          style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
        >
          {recent.length === 0 && <span className="muted text-xs p-2">No saved doodles in gallery yet.</span>}
          {recent.map((d) => (
            <button
              key={d.id}
              type="button"
              className="shrink-0 transition-transform active:scale-95 rounded-lg overflow-hidden border"
              style={{ borderColor: 'var(--line)' }}
              onClick={() => send(null, d.id)}
            >
              <DoodleImage path={d.storage_path} className="h-24 w-auto rounded-lg" />
            </button>
          ))}
        </div>
      )}

      {/* Message Input Bar */}
      <form onSubmit={send} className="flex gap-2 p-2 items-center max-w-xl w-full mx-auto shrink-0">
        <button
          type="button"
          className="btn btn-ghost !px-3 !min-h-[44px] text-lg"
          onClick={openPicker}
          aria-label="Attach doodle"
        >
          🎨
        </button>
        <input
          className="input flex-1"
          value={text}
          onChange={handleTextChange}
          placeholder="Message…"
          maxLength={2000}
        />
        <button type="submit" className="btn !min-h-[44px] !px-4" disabled={!text.trim()}>
          Send
        </button>
      </form>

      {/* Full-size Doodle Modal */}
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
