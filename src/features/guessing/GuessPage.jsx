import { useEffect, useState, useRef, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useRoom } from '../room/RoomContext'
import { useDialog } from '../../components/DialogContext'
import { useDrawingCanvas } from '../canvas/useDrawingCanvas'
import DrawingCanvas from '../canvas/DrawingCanvas'
import PageTransition from '../../components/PageTransition'
import { getRandomPrompts } from './prompts'

export default function GuessPage() {
  const { user } = useAuth()
  const { room, partner, nameOf } = useRoom()
  const { confirm, alert, toast } = useDialog()

  const [loading, setLoading] = useState(true)
  const [round, setRound] = useState(null)
  const [prompt, setPrompt] = useState('')
  const [guesses, setGuesses] = useState([])
  const [scores, setScores] = useState({ me: 0, partner: 0 })
  const [elapsed, setElapsed] = useState(0)

  // Creation state
  const [showPicker, setShowPicker] = useState(false)
  const [promptOptions, setPromptOptions] = useState(() => getRandomPrompts(6))
  const [chosenPrompt, setChosenPrompt] = useState('')
  const [customPrompt, setCustomPrompt] = useState('')
  const [busy, setBusy] = useState(false)

  // Guessing state
  const [guessInput, setGuessInput] = useState('')
  const [guessFeedback, setGuessFeedback] = useState('')
  const [submittingGuess, setSubmittingGuess] = useState(false)
  const guessesEndRef = useRef(null)

  const isDrawer = round?.drawer_id === user?.id
  const isFinished = round?.status === 'solved' || round?.status === 'revealed'
  const isGuesser = round && !isDrawer && !isFinished

  // Canvas hook - active only during a round
  const channelName = round?.id ? `game:${round.id}` : null
  const canvas = useDrawingCanvas({
    channelName,
    userId: user?.id,
    readOnly: !isDrawer || isFinished,
  })

  // Load latest round and scores
  const loadData = async () => {
    if (!room) return
    try {
      const { data: latestRounds, error: rErr } = await supabase
        .from('game_rounds')
        .select('*')
        .eq('room_id', room.id)
        .order('created_at', { ascending: false })
        .limit(1)

      if (rErr) throw rErr
      const activeRound = latestRounds?.[0] || null
      setRound(activeRound)

      const { data: allSolved, error: sErr } = await supabase
        .from('game_rounds')
        .select('winner_id')
        .eq('room_id', room.id)
        .eq('status', 'solved')

      if (!sErr && allSolved) {
        let meWins = 0
        let partnerWins = 0
        allSolved.forEach((r) => {
          if (r.winner_id === user.id) meWins++
          else if (r.winner_id === partner?.id) partnerWins++
        })
        setScores({ me: meWins, partner: partnerWins })
      }

      if (activeRound) {
        const { data: gs } = await supabase
          .from('game_guesses')
          .select('*')
          .eq('round_id', activeRound.id)
          .order('created_at', { ascending: true })
        setGuesses(gs || [])

        if (activeRound.drawer_id === user.id || activeRound.status === 'solved' || activeRound.status === 'revealed') {
          const { data: sec } = await supabase
            .from('game_secrets')
            .select('prompt')
            .eq('round_id', activeRound.id)
            .maybeSingle()
          setPrompt(sec?.prompt || '')
        } else {
          setPrompt('')
        }
      }
    } catch (err) {
      console.error('Error loading game data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [room?.id, partner?.id])

  // Realtime subscription for round changes
  useEffect(() => {
    if (!room) return

    const ch = supabase
      .channel(`game_updates:${room.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_rounds', filter: `room_id=eq.${room.id}` },
        async (payload) => {
          const updated = payload.new
          if (updated) {
            setRound(updated)
            if (updated.status === 'solved' || updated.status === 'revealed') {
              const { data: sec } = await supabase
                .from('game_secrets')
                .select('prompt')
                .eq('round_id', updated.id)
                .maybeSingle()
              if (sec) setPrompt(sec.prompt)
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
  }, [room?.id])

  // Realtime subscription for guesses of current round
  useEffect(() => {
    if (!round?.id) return

    const ch = supabase
      .channel(`game_guesses:${round.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'game_guesses', filter: `round_id=eq.${round.id}` },
        (payload) => {
          const newGuess = payload.new
          if (newGuess) {
            setGuesses((prev) => (prev.some((g) => g.id === newGuess.id) ? prev : [...prev, newGuess]))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
  }, [round?.id])

  // Timer loop for active round
  useEffect(() => {
    if (!round || isFinished) return
    const startTime = new Date(round.created_at).getTime()
    const updateTime = () => {
      const now = Date.now()
      setElapsed(Math.max(0, Math.floor((now - startTime) / 1000)))
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [round?.id, round?.created_at, isFinished])

  useEffect(() => {
    guessesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [guesses.length])

  const formattedTime = useMemo(() => {
    const mins = Math.floor(elapsed / 60)
    const secs = elapsed % 60
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
  }, [elapsed])

  const startNewRound = async (customOrChosen = null) => {
    const promptText = (customOrChosen || customPrompt || chosenPrompt).trim()
    if (!promptText) return

    setBusy(true)
    try {
      const { data: newRound, error: rErr } = await supabase
        .from('game_rounds')
        .insert({
          room_id: room.id,
          drawer_id: user.id,
          status: 'drawing',
        })
        .select()
        .single()

      if (rErr) throw rErr

      const { error: sErr } = await supabase
        .from('game_secrets')
        .insert({
          round_id: newRound.id,
          prompt: promptText,
        })

      if (sErr) throw sErr

      setRound(newRound)
      setPrompt(promptText)
      setGuesses([])
      setShowPicker(false)
      setChosenPrompt('')
      setCustomPrompt('')
      canvas.clearAll(false)
      toast('Round started! Start drawing 🎨')
    } catch (err) {
      alert({ title: 'Could Not Start Round', message: err.message })
    } finally {
      setBusy(false)
    }
  }

  const handleGuessSubmit = async (e) => {
    e?.preventDefault()
    const text = guessInput.trim()
    if (!text || submittingGuess || !round) return

    setSubmittingGuess(true)
    setGuessFeedback('')
    try {
      const { data: isCorrect, error } = await supabase.rpc('submit_guess', {
        rid: round.id,
        guess_text: text,
      })

      if (error) throw error

      if (isCorrect) {
        setGuessFeedback('🎉 Correct! You won this round!')
        toast('🎉 Correct! You won this round!')
        setGuessInput('')
      } else {
        setGuessFeedback('❌ Not quite, keep trying!')
        setGuessInput('')
      }
    } catch (err) {
      setGuessFeedback(err.message)
    } finally {
      setSubmittingGuess(false)
    }
  }

  const revealRound = async () => {
    const ok = await confirm({
      title: 'Reveal Secret Word',
      message: 'Give up and reveal the secret word to end this round?',
      confirmText: 'Reveal Word',
      danger: true,
    })
    if (!ok) return

    const { error } = await supabase
      .from('game_rounds')
      .update({ status: 'revealed' })
      .eq('id', round.id)
      .eq('drawer_id', user.id)
    if (error) alert({ title: 'Error', message: error.message })
  }

  if (loading) {
    return (
      <div className="page flex flex-col items-center justify-center min-h-[50vh] muted">
        <div className="text-3xl animate-bounce mb-2">🎲</div>
        <p>Loading game…</p>
      </div>
    )
  }

  // Prompt Picker Modal / View
  if (showPicker) {
    return (
      <PageTransition className="page space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Pick What to Draw</h1>
          <button className="btn btn-ghost !min-h-[44px]" onClick={() => setShowPicker(false)}>
            Cancel
          </button>
        </div>

        <p className="muted text-sm">
          Select one of the ideas below or type your own secret prompt. Your partner will try to guess it!
        </p>

        <div className="grid grid-cols-2 gap-2">
          {promptOptions.map((p) => {
            const isSelected = chosenPrompt === p
            return (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setChosenPrompt(p)
                  setCustomPrompt('')
                }}
                className="card text-left p-3 min-h-[56px] transition-all active:scale-95"
                style={{
                  border: isSelected ? '2px solid var(--primary)' : '1px solid var(--line)',
                  background: isSelected ? 'var(--bg)' : 'var(--surface)',
                  fontWeight: isSelected ? 700 : 500,
                }}
              >
                {p}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          className="btn btn-ghost w-full"
          onClick={() => setPromptOptions(getRandomPrompts(6))}
        >
          🎲 Shuffle Ideas
        </button>

        <div className="card space-y-2">
          <label className="text-sm font-semibold block">Or type your own word:</label>
          <input
            className="input"
            placeholder="e.g. Moonlight walk"
            value={customPrompt}
            maxLength={60}
            onChange={(e) => {
              setCustomPrompt(e.target.value)
              if (e.target.value) setChosenPrompt('')
            }}
          />
        </div>

        <button
          className="btn w-full !min-h-[48px] text-base"
          disabled={busy || (!chosenPrompt && !customPrompt.trim())}
          onClick={() => startNewRound()}
        >
          {busy ? 'Starting…' : 'Start Drawing 🎨'}
        </button>
      </PageTransition>
    )
  }

  // Results Screen (Round Solved or Revealed)
  if (round && isFinished) {
    const isWinner = round.winner_id === user.id
    const wasSolved = round.status === 'solved'

    return (
      <PageTransition className="page space-y-4">
        <div className="card text-center space-y-2 py-6">
          <div className="text-5xl">{wasSolved ? '🏆' : '💡'}</div>
          <h1 className="text-2xl font-bold">
            {wasSolved
              ? isWinner
                ? 'You guessed it right!'
                : `${nameOf(round.winner_id)} guessed it!`
              : 'Secret Revealed!'}
          </h1>
          <p className="text-lg">
            The secret prompt was: <span className="font-bold underline">{prompt || '...'}</span>
          </p>
          <p className="muted text-xs">
            Drawn by {isDrawer ? 'You' : nameOf(round.drawer_id)} · Total guesses: {guesses.length}
          </p>
        </div>

        {/* Score Tally */}
        <div className="card flex items-center justify-around text-center py-3">
          <div>
            <div className="text-xs muted font-semibold uppercase">You</div>
            <div className="text-2xl font-bold">{scores.me}</div>
          </div>
          <div className="text-xl muted font-light">vs</div>
          <div>
            <div className="text-xs muted font-semibold uppercase">{partner?.display_name || 'Partner'}</div>
            <div className="text-2xl font-bold">{scores.partner}</div>
          </div>
        </div>

        {/* Drawing snapshot */}
        <div className="card space-y-2">
          <h2 className="text-sm font-bold muted uppercase">Final Drawing</h2>
          <DrawingCanvas
            canvasRef={canvas.canvasRef}
            wrapRef={canvas.wrapRef}
            canvasProps={canvas.canvasProps}
            readOnly={true}
          />
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button
            className="btn w-full !min-h-[48px] text-base"
            onClick={() => setShowPicker(true)}
          >
            🎨 New Round (I&apos;ll Draw)
          </button>
          <p className="text-center text-xs muted">
            Or wait for {partner?.display_name || 'your partner'} to start a round as drawer.
          </p>
        </div>
      </PageTransition>
    )
  }

  // Active Round - User is the DRAWER
  if (round && isDrawer) {
    return (
      <PageTransition className="page !pt-[calc(env(safe-area-inset-top)+.5rem)] space-y-3">
        <div
          className="card py-2 px-3 flex items-center justify-between shadow-xs"
          style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}
        >
          <div>
            <div className="text-[11px] opacity-80 uppercase tracking-wide">Your Secret Word:</div>
            <div className="text-xl font-bold">{prompt || 'Loading…'}</div>
          </div>
          <div className="text-right">
            <span className="text-xs opacity-75 font-mono">⏱ {formattedTime}</span>
            <div className="text-[10px] opacity-75">
              {canvas.connectionStatus === 'connected' ? '● connected' : '○ ' + canvas.connectionStatus}
            </div>
          </div>
        </div>

        <DrawingCanvas
          canvasRef={canvas.canvasRef}
          wrapRef={canvas.wrapRef}
          canvasProps={canvas.canvasProps}
          readOnly={false}
          color={canvas.color}
          setColor={canvas.setColor}
          size={canvas.size}
          setSize={canvas.setSize}
          eraser={canvas.eraser}
          setEraser={canvas.setEraser}
          toolbar={
            <div className="flex gap-2 items-center flex-wrap pt-1">
              <button type="button" className="btn btn-ghost" onClick={canvas.undo}>
                ↶ Undo
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={async () => {
                  const ok = await confirm({
                    title: 'Clear Canvas',
                    message: 'Clear your drawing?',
                    confirmText: 'Clear',
                    danger: true,
                  })
                  if (ok) canvas.clearAll(true)
                }}
              >
                Clear
              </button>
              <button
                type="button"
                className="btn btn-ghost text-xs ml-auto"
                style={{ color: 'var(--danger)' }}
                onClick={revealRound}
              >
                Give up & reveal
              </button>
            </div>
          }
        />

        <div className="card space-y-2">
          <div className="flex justify-between items-center">
            <h2 className="text-xs font-bold uppercase muted">Partner&apos;s Guesses ({guesses.length})</h2>
            <span className="text-xs muted italic">Guesses update live</span>
          </div>

          <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1">
            {guesses.length === 0 ? (
              <p className="text-xs muted py-2 text-center">Waiting for guesses…</p>
            ) : (
              guesses.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between text-sm px-2.5 py-1.5 rounded-lg"
                  style={{
                    background: g.is_correct ? 'rgba(74, 222, 128, 0.15)' : 'var(--bg)',
                    border: g.is_correct ? '1px solid #22c55e' : '1px solid var(--line)',
                  }}
                >
                  <span className="font-medium">{g.guess}</span>
                  <span className="text-xs">{g.is_correct ? '✅ Solved!' : '❌'}</span>
                </div>
              ))
            )}
            <div ref={guessesEndRef} />
          </div>
        </div>
      </PageTransition>
    )
  }

  // Active Round - User is the GUESSER
  if (round && isGuesser) {
    return (
      <PageTransition className="page !pt-[calc(env(safe-area-inset-top)+.5rem)] space-y-3">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h1 className="text-lg font-bold">Guess My Drawing</h1>
            <p className="text-xs muted">{nameOf(round.drawer_id)} is drawing…</p>
          </div>
          <div className="text-right">
            <div className="text-sm font-mono font-bold">⏱ {formattedTime}</div>
            <div className="text-[10px] muted">
              {canvas.connectionStatus === 'connected' ? '● connected' : '○ ' + canvas.connectionStatus}
            </div>
          </div>
        </div>

        <DrawingCanvas
          canvasRef={canvas.canvasRef}
          wrapRef={canvas.wrapRef}
          canvasProps={canvas.canvasProps}
          readOnly={true}
        />

        <form onSubmit={handleGuessSubmit} className="card space-y-2">
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="Type your guess here…"
              value={guessInput}
              onChange={(e) => setGuessInput(e.target.value)}
              maxLength={60}
              autoComplete="off"
              autoFocus
            />
            <button
              type="submit"
              className="btn px-5"
              disabled={submittingGuess || !guessInput.trim()}
            >
              {submittingGuess ? '…' : 'Guess!'}
            </button>
          </div>
          {guessFeedback && (
            <p
              className="text-xs font-semibold px-1"
              style={{
                color: guessFeedback.includes('Correct') ? '#16a34a' : 'var(--danger)',
              }}
            >
              {guessFeedback}
            </p>
          )}
        </form>

        <div className="card space-y-2">
          <div className="text-xs font-bold uppercase muted">Previous Guesses ({guesses.length})</div>
          <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
            {guesses.length === 0 ? (
              <p className="text-xs muted py-1 text-center">No guesses made yet.</p>
            ) : (
              guesses.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between text-sm px-2.5 py-1.5 rounded-lg"
                  style={{
                    background: g.is_correct ? 'rgba(74, 222, 128, 0.15)' : 'var(--bg)',
                    border: g.is_correct ? '1px solid #22c55e' : '1px solid var(--line)',
                  }}
                >
                  <span>{g.guess}</span>
                  <span className="text-xs">{g.is_correct ? '🎉 Correct!' : '❌'}</span>
                </div>
              ))
            )}
            <div ref={guessesEndRef} />
          </div>
        </div>
      </PageTransition>
    )
  }

  // Lobby / Start Screen
  return (
    <PageTransition className="page space-y-4">
      <div className="text-center space-y-1">
        <h1 className="text-3xl font-bold">Guess My Drawing 🎲</h1>
        <p className="muted text-sm">One draws a secret word live, the other guesses!</p>
      </div>

      <div className="card flex items-center justify-around text-center py-4">
        <div>
          <div className="text-xs muted font-semibold uppercase">You</div>
          <div className="text-3xl font-bold">{scores.me}</div>
        </div>
        <div className="text-2xl muted font-light">vs</div>
        <div>
          <div className="text-xs muted font-semibold uppercase">{partner?.display_name || 'Partner'}</div>
          <div className="text-3xl font-bold">{scores.partner}</div>
        </div>
      </div>

      <div className="card space-y-3 text-center py-6">
        <div className="text-5xl">🎨</div>
        <h2 className="text-lg font-bold">Ready to play?</h2>
        <p className="muted text-sm max-w-xs mx-auto">
          Start a new round to draw for {partner?.display_name || 'your person'}.
        </p>
        <button
          className="btn w-full !min-h-[48px] text-base"
          onClick={() => {
            setPromptOptions(getRandomPrompts(6))
            setShowPicker(true)
          }}
        >
          Start a New Round
        </button>
      </div>
    </PageTransition>
  )
}
