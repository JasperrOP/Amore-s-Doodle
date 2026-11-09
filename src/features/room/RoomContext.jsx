import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'

const RoomCtx = createContext(null)
export const useRoom = () => useContext(RoomCtx)

export function RoomProvider({ children }) {
  const { user } = useAuth()
  const [room, setRoom] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [isPartnerOnline, setIsPartnerOnline] = useState(false)

  const refresh = useCallback(async () => {
    if (!user) return
    const { data: mem } = await supabase
      .from('room_members')
      .select('room_id, rooms(*)')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: false })
      .limit(1)

    const r = mem?.[0]?.rooms || null
    setRoom(r)
    if (r) {
      const { data: ms } = await supabase.from('room_members').select('user_id').eq('room_id', r.id)
      const ids = (ms || []).map((m) => m.user_id)
      const { data: profs } = await supabase.from('profiles').select('id, display_name, avatar_url').in('id', ids)
      setMembers(profs || [])
    } else {
      setMembers([])
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    refresh()
  }, [refresh])

  const nameOf = (id) => members.find((m) => m.id === id)?.display_name || 'Someone'
  const partner = members.find((m) => m.id !== user?.id) || null

  // Presence channel to track partner online/offline state
  useEffect(() => {
    if (!room?.id || !user?.id) {
      setIsPartnerOnline(false)
      return
    }

    const presenceChannel = supabase.channel(`presence:${room.id}`, {
      config: {
        presence: { key: user.id },
      },
    })

    const updatePresence = () => {
      const state = presenceChannel.presenceState()
      if (partner?.id) {
        const partnerPresence = state[partner.id]
        setIsPartnerOnline(Boolean(partnerPresence && partnerPresence.length > 0))
      } else {
        setIsPartnerOnline(false)
      }
    }

    presenceChannel
      .on('presence', { event: 'sync' }, updatePresence)
      .on('presence', { event: 'join' }, updatePresence)
      .on('presence', { event: 'leave' }, updatePresence)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            user_id: user.id,
            online_at: new Date().toISOString(),
          })
        }
      })

    return () => {
      supabase.removeChannel(presenceChannel)
    }
  }, [room?.id, user?.id, partner?.id])

  return (
    <RoomCtx.Provider
      value={{
        room,
        members,
        partner,
        nameOf,
        loading,
        refresh,
        isPartnerOnline,
      }}
    >
      {children}
    </RoomCtx.Provider>
  )
}
