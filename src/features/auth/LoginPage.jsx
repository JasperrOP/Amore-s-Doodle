import { useState } from 'react'
import { supabase, isConfigured } from '../../lib/supabase'
import PageTransition from '../../components/PageTransition'

export default function LoginPage() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    const res =
      mode === 'signup'
        ? await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { data: { display_name: name.trim() || undefined } },
          })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (res.error) {
      setMsg(res.error.message)
    } else if (mode === 'signup' && !res.data.session) {
      setMsg('Check your email to confirm your account, then sign in.')
    }
  }

  return (
    <PageTransition className="page min-h-full flex flex-col justify-center">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold leading-tight tracking-tight">
          AMORE’S
          <br />
          DOODLE
        </h1>
        <p className="muted mt-3 italic text-sm">A private shared canvas for two.</p>
      </div>

      {!isConfigured && (
        <div className="card text-sm mb-4 border-amber-300 bg-amber-50/50">
          Supabase isn&apos;t configured yet. Copy <code>.env.example</code> to <code>.env.local</code> and add your keys.
        </div>
      )}

      <form onSubmit={submit} className="card space-y-3.5 shadow-sm">
        {mode === 'signup' && (
          <div>
            <label className="text-xs font-semibold muted block mb-1">Your Name</label>
            <input
              className="input"
              placeholder="e.g. Maya"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={40}
            />
          </div>
        )}
        <div>
          <label className="text-xs font-semibold muted block mb-1">Email</label>
          <input
            className="input"
            type="email"
            placeholder="you@love.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div>
          <label className="text-xs font-semibold muted block mb-1">Password</label>
          <input
            className="input"
            type="password"
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          />
        </div>

        <button className="btn w-full !min-h-[48px] text-base mt-2" disabled={busy}>
          {busy ? '…' : mode === 'signup' ? 'Create Account' : 'Sign In'}
        </button>

        {msg && (
          <p className="text-xs text-center font-medium py-1" style={{ color: 'var(--danger)' }}>
            {msg}
          </p>
        )}
      </form>

      <button
        type="button"
        className="muted mt-5 underline text-xs text-center self-center !min-h-[44px] flex items-center"
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin')
          setMsg('')
        }}
      >
        {mode === 'signin' ? "New here? Create a couple's account" : 'Have an account? Sign in'}
      </button>
    </PageTransition>
  )
}
