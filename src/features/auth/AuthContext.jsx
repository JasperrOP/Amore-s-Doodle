import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

export function applyTheme(t) {
  document.documentElement.dataset.theme = t
  localStorage.setItem('theme', t)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'forest' ? '#1F3D2B' : '#14213D')
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (uid) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    setProfile(data)
    if (data?.theme) applyTheme(data.theme)
  }, [])

  useEffect(() => {
    applyTheme(localStorage.getItem('theme') || 'navy')
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) loadProfile(data.session.user.id).finally(() => setLoading(false))
      else setLoading(false)
    }).catch(() => setLoading(false))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (s) loadProfile(s.user.id); else setProfile(null)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  const updateProfile = async (patch) => {
    const { data } = await supabase.from('profiles').update(patch).eq('id', session.user.id).select().single()
    if (data) { setProfile(data); if (patch.theme) applyTheme(patch.theme) }
  }

  return (
    <AuthCtx.Provider value={{ session, user: session?.user, profile, loading, updateProfile, signOut: () => supabase.auth.signOut() }}>
      {children}
    </AuthCtx.Provider>
  )
}
