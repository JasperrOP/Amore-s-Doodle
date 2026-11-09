import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useRoom } from '../room/RoomContext'
import { useDialog } from '../../components/DialogContext'
import { useDrawingCanvas } from './useDrawingCanvas'
import DrawingCanvas from './DrawingCanvas'
import PageTransition from '../../components/PageTransition'

export default function CanvasPage() {
  const { user } = useAuth()
  const { room } = useRoom()
  const { confirm, toast, alert } = useDialog()

  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [checkpointStatus, setCheckpointStatus] = useState('')
  const [showNewDialog, setShowNewDialog] = useState(false)

  const checkpointTimer = useRef(null)
  const isInitialLoadDone = useRef(false)

  // Debounced autosave to canvas_checkpoints
  const saveCheckpoint = useCallback(
    async (latestStrokes) => {
      if (!room?.id || !isInitialLoadDone.current) return
      try {
        setCheckpointStatus('Saving checkpoint…')
        const { error } = await supabase.from('canvas_checkpoints').upsert(
          {
            room_id: room.id,
            strokes: latestStrokes,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'room_id' }
        )
        if (error) throw error
        setCheckpointStatus('Autosaved')
        setTimeout(() => setCheckpointStatus(''), 2500)
      } catch (err) {
        console.warn('Checkpoint autosave warning:', err.message)
        setCheckpointStatus('')
      }
    },
    [room?.id]
  )

  const handleStrokesChange = useCallback(
    (newStrokes) => {
      if (!isInitialLoadDone.current) return
      if (checkpointTimer.current) clearTimeout(checkpointTimer.current)
      checkpointTimer.current = setTimeout(() => {
        saveCheckpoint(newStrokes)
      }, 8000)
    },
    [saveCheckpoint]
  )

  const canvas = useDrawingCanvas({
    channelName: room?.id ? `canvas:${room.id}` : null,
    userId: user?.id,
    readOnly: false,
    onStrokesChange: handleStrokesChange,
  })

  // Load checkpoint on mount before requesting sync from partner
  useEffect(() => {
    if (!room?.id) return
    let active = true

    const loadCheckpoint = async () => {
      try {
        const { data, error } = await supabase
          .from('canvas_checkpoints')
          .select('strokes')
          .eq('room_id', room.id)
          .maybeSingle()

        if (!active) return

        if (!error && data?.strokes && Array.isArray(data.strokes) && data.strokes.length > 0) {
          canvas.loadStrokes(data.strokes, false)
        }
      } catch (err) {
        console.error('Failed to load canvas checkpoint:', err)
      } finally {
        if (active) {
          isInitialLoadDone.current = true
        }
      }
    }

    loadCheckpoint()

    return () => {
      active = false
      if (checkpointTimer.current) clearTimeout(checkpointTimer.current)
    }
  }, [room?.id])

  // Save current canvas to doodles gallery
  const saveToGallery = async () => {
    if (!room?.id || !user?.id || saving) return
    setSaving(true)
    setStatus('Saving to gallery…')
    try {
      const blob = await canvas.exportBlob('image/png')
      if (!blob) throw new Error('Could not render canvas image')

      // Validate file type and size (< 2MB)
      if (blob.type !== 'image/png') {
        throw new Error('Only PNG doodles are supported')
      }
      if (blob.size > 2 * 1024 * 1024) {
        throw new Error('Doodle image exceeds 2MB limit (size: ' + Math.round(blob.size / 1024) + 'KB)')
      }

      const fileId = crypto.randomUUID ? crypto.randomUUID() : `d_${Date.now()}`
      const path = `${room.id}/${fileId}.png`

      const { error: upErr } = await supabase.storage.from('doodles').upload(path, blob, {
        contentType: 'image/png',
        upsert: false,
      })
      if (upErr) throw upErr

      const dateTitle = new Date().toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })

      const { error: insErr } = await supabase.from('doodles').insert({
        room_id: room.id,
        creator_id: user.id,
        storage_path: path,
        title: dateTitle,
      })
      if (insErr) throw insErr

      // Also update checkpoint
      saveCheckpoint(canvas.strokesRef.current)

      toast('Saved to gallery ✓')
      setStatus('Saved to gallery ✓')
      return true
    } catch (e) {
      alert({ title: 'Save Failed', message: e.message })
      setStatus('Save failed: ' + e.message)
      return false
    } finally {
      setSaving(false)
      setTimeout(() => setStatus(''), 3500)
    }
  }

  // Handle "New Canvas" workflow
  const handleNewCanvas = async (shouldSaveFirst) => {
    setShowNewDialog(false)
    if (shouldSaveFirst) {
      const saved = await saveToGallery()
      if (!saved) return
    }
    canvas.clearAll(true)
    saveCheckpoint([])
    toast('Started new canvas')
  }

  const handleClearAll = async () => {
    const ok = await confirm({
      title: 'Clear Canvas',
      message: 'Clear the whole canvas for both of you?',
      confirmText: 'Clear Canvas',
      danger: true,
    })
    if (!ok) return
    canvas.clearAll(true)
    saveCheckpoint([])
    toast('Canvas cleared')
  }

  const connectionLabel = () => {
    switch (canvas.connectionStatus) {
      case 'connected':
        return <span style={{ color: '#16a34a' }}>● live</span>
      case 'reconnecting':
        return <span style={{ color: '#d97706' }}>🟡 reconnecting…</span>
      case 'offline':
        return <span style={{ color: 'var(--danger)' }}>○ offline</span>
      default:
        return <span className="muted">○ connecting…</span>
    }
  }

  return (
    <PageTransition className="page !pt-[calc(env(safe-area-inset-top)+.5rem)] space-y-2">
      {/* Canvas Top Bar */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="text-xl font-bold">Shared Canvas</h1>
          {checkpointStatus && <span className="text-[11px] muted italic">{checkpointStatus}</span>}
        </div>
        <div className="text-right text-xs">{connectionLabel()}</div>
      </div>

      {/* Drawing Canvas */}
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
          <div className="flex gap-2 flex-wrap items-center pt-1">
            <button
              type="button"
              className="btn btn-ghost !min-h-[44px]"
              onClick={canvas.undo}
              title="Undo my last stroke"
            >
              ↶ Undo
            </button>
            <button
              type="button"
              className="btn btn-ghost !min-h-[44px]"
              onClick={() => {
                if (canvas.strokeCount === 0) return
                setShowNewDialog(true)
              }}
              title="New Canvas"
            >
              ✨ New
            </button>
            <button
              type="button"
              className="btn btn-ghost !min-h-[44px]"
              onClick={handleClearAll}
              title="Clear canvas"
            >
              Clear
            </button>
            <button
              type="button"
              className="btn ml-auto !min-h-[44px]"
              onClick={saveToGallery}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        }
      />

      {status && (
        <p
          className="text-xs text-center font-medium py-1"
          style={{ color: status.includes('failed') ? 'var(--danger)' : 'var(--ink)' }}
        >
          {status}
        </p>
      )}

      {/* New Canvas Confirmation Dialog */}
      {showNewDialog && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card max-w-sm w-full space-y-3 p-5 shadow-xl animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-bold">Start a New Canvas?</h3>
            <p className="text-sm muted">
              Would you like to save your current drawing to the gallery before starting fresh?
            </p>
            <div className="space-y-2 pt-2">
              <button
                type="button"
                className="btn w-full !min-h-[44px]"
                onClick={() => handleNewCanvas(true)}
              >
                💾 Save to Gallery & Start New
              </button>
              <button
                type="button"
                className="btn btn-ghost w-full !min-h-[44px]"
                onClick={() => handleNewCanvas(false)}
              >
                Start New Without Saving
              </button>
              <button
                type="button"
                className="btn btn-ghost w-full !min-h-[44px]"
                onClick={() => setShowNewDialog(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </PageTransition>
  )
}
