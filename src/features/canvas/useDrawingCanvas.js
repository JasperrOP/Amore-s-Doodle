import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

export const COLORS = ['#14213D', '#1F3D2B', '#B23A48', '#E07A5F', '#F2B134', '#3A86FF', '#8E6BBF', '#2B2B2B']
export const SIZES = [3, 6, 12, 22]

export function useDrawingCanvas({
  channelName,
  userId,
  readOnly = false,
  aspectRatio = 4 / 3,
  onStrokesChange = null,
  initialStrokes = null,
}) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const strokesRef = useRef(initialStrokes ? [...initialStrokes] : [])
  const currentRef = useRef(null)
  const bufferRef = useRef([])
  const channelRef = useRef(null)
  const hasSubscribedOnce = useRef(false)

  const [color, setColor] = useState(COLORS[0])
  const [size, setSize] = useState(SIZES[1])
  const [eraser, setEraser] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('connecting') // 'connected' | 'connecting' | 'reconnecting' | 'offline'
  const [strokeCount, setStrokeCount] = useState(strokesRef.current.length)

  const getPaperColor = () => {
    if (typeof window === 'undefined') return '#FFFDF7'
    return getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#FFFDF7'
  }

  const drawSeg = useCallback((s, from) => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    const w = c.width
    const h = c.height
    const dpr = c.clientWidth > 0 ? c.width / c.clientWidth : window.devicePixelRatio || 1

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = s.color
    ctx.fillStyle = s.color
    ctx.lineWidth = s.size * dpr

    const p = s.pts
    if (!p || p.length === 0) return
    if (p.length === 1) {
      ctx.beginPath()
      ctx.arc(p[0][0] * w, p[0][1] * h, Math.max((s.size * dpr) / 2, 1), 0, Math.PI * 2)
      ctx.fill()
      return
    }

    ctx.beginPath()
    const startIndex = Math.max(from - 1, 0)
    ctx.moveTo(p[startIndex][0] * w, p[startIndex][1] * h)
    for (let i = Math.max(from, 1); i < p.length; i++) {
      ctx.lineTo(p[i][0] * w, p[i][1] * h)
    }
    ctx.stroke()
  }, [])

  const redraw = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.fillStyle = getPaperColor()
    ctx.fillRect(0, 0, c.width, c.height)
    strokesRef.current.forEach((s) => drawSeg(s, 0))
    setStrokeCount(strokesRef.current.length)
  }, [drawSeg])

  // Fit canvas to container width with retina DPR
  const fit = useCallback(() => {
    const c = canvasRef.current
    const w = wrapRef.current
    if (!c || !w) return
    const dpr = window.devicePixelRatio || 1
    const cw = w.clientWidth || 320
    const ch = Math.round(cw * aspectRatio)
    c.style.width = cw + 'px'
    c.style.height = ch + 'px'
    c.width = Math.round(cw * dpr)
    c.height = Math.round(ch * dpr)
    redraw()
  }, [aspectRatio, redraw])

  // Listen to resize and theme changes
  useEffect(() => {
    fit()
    window.addEventListener('resize', fit)

    // Observe data-theme changes to redraw paper color
    const observer = new MutationObserver(() => redraw())
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    return () => {
      window.removeEventListener('resize', fit)
      observer.disconnect()
    }
  }, [fit, redraw])

  // Realtime channel handling
  useEffect(() => {
    if (!channelName) return

    setConnectionStatus(hasSubscribedOnce.current ? 'reconnecting' : 'connecting')

    const ch = supabase.channel(channelName, {
      config: {
        broadcast: { self: false },
        private: true,
      },
    })
    channelRef.current = ch

    const send = (payload) => {
      if (ch.state === 'joined') {
        ch.send({ type: 'broadcast', event: 'c', payload })
      }
    }
    ch._send = send

    ch.on('broadcast', { event: 'c' }, ({ payload: m }) => {
      if (!m || !m.t) return

      if (m.t === 'seg') {
        let s = strokesRef.current.find((x) => x.id === m.id)
        if (!s) {
          s = { id: m.id, author: m.author, color: m.color, size: m.size, pts: [] }
          strokesRef.current.push(s)
        }
        const from = s.pts.length
        s.pts.push(...m.pts)
        drawSeg(s, from)
        setStrokeCount(strokesRef.current.length)
        onStrokesChange?.(strokesRef.current)
      } else if (m.t === 'undo') {
        strokesRef.current = strokesRef.current.filter((x) => x.id !== m.id)
        redraw()
        onStrokesChange?.(strokesRef.current)
      } else if (m.t === 'clear') {
        strokesRef.current = []
        redraw()
        onStrokesChange?.([])
      } else if (m.t === 'hello') {
        if (strokesRef.current.length) {
          send({ t: 'sync', strokes: strokesRef.current })
        }
      } else if (m.t === 'sync') {
        // Partner sent latest strokes
        if (m.strokes && Array.isArray(m.strokes)) {
          strokesRef.current = m.strokes
          redraw()
          onStrokesChange?.(strokesRef.current)
        }
      }
    }).subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        hasSubscribedOnce.current = true
        setConnectionStatus('connected')
        // Say hello to ask partner for any strokes we missed
        send({ t: 'hello' })
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        setConnectionStatus(hasSubscribedOnce.current ? 'reconnecting' : 'offline')
      }
    })

    return () => {
      supabase.removeChannel(ch)
      channelRef.current = null
    }
  }, [channelName, drawSeg, redraw, onStrokesChange])

  // Buffer flush loop (~60ms)
  useEffect(() => {
    if (readOnly) return
    const id = setInterval(() => {
      const s = currentRef.current
      if (s && bufferRef.current.length && channelRef.current?._send) {
        channelRef.current._send({
          t: 'seg',
          id: s.id,
          author: s.author,
          color: s.color,
          size: s.size,
          pts: bufferRef.current,
        })
        bufferRef.current = []
      }
    }, 60)
    return () => clearInterval(id)
  }, [readOnly])

  const getPos = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]
  }

  const handlePointerDown = (e) => {
    if (readOnly || !canvasRef.current) return
    e.preventDefault()
    canvasRef.current.setPointerCapture?.(e.pointerId)
    const p = getPos(e)
    const strokeColor = eraser ? getPaperColor() : color
    const strokeSize = eraser ? size * 2 : size
    const s = {
      id: crypto.randomUUID ? crypto.randomUUID() : `s_${Date.now()}_${Math.random()}`,
      author: userId || 'local',
      color: strokeColor,
      size: strokeSize,
      pts: [p],
    }
    currentRef.current = s
    strokesRef.current.push(s)
    bufferRef.current = [p]
    drawSeg(s, 0)
    setStrokeCount(strokesRef.current.length)
  }

  const handlePointerMove = (e) => {
    if (readOnly || !currentRef.current) return
    const s = currentRef.current
    const evs = e.nativeEvent?.getCoalescedEvents?.() || [e.nativeEvent || e]
    const from = s.pts.length
    evs.forEach((ev) => {
      const p = getPos(ev)
      s.pts.push(p)
      bufferRef.current.push(p)
    })
    drawSeg(s, from)
  }

  const handlePointerUp = () => {
    if (readOnly) return
    if (currentRef.current && bufferRef.current.length && channelRef.current?._send) {
      channelRef.current._send({
        t: 'seg',
        id: currentRef.current.id,
        author: currentRef.current.author,
        color: currentRef.current.color,
        size: currentRef.current.size,
        pts: bufferRef.current,
      })
      bufferRef.current = []
    }
    if (currentRef.current) {
      onStrokesChange?.(strokesRef.current)
    }
    currentRef.current = null
  }

  const undo = () => {
    if (readOnly) return
    // Remove last stroke by this author (or last stroke overall if author matches)
    const idx = [...strokesRef.current].reverse().findIndex((s) => s.author === userId)
    if (idx < 0) return
    const target = strokesRef.current[strokesRef.current.length - 1 - idx]
    strokesRef.current = strokesRef.current.filter((x) => x.id !== target.id)
    redraw()
    channelRef.current?._send?.({ t: 'undo', id: target.id })
    onStrokesChange?.(strokesRef.current)
  }

  const clearAll = (broadcast = true) => {
    strokesRef.current = []
    redraw()
    if (broadcast) {
      channelRef.current?._send?.({ t: 'clear' })
    }
    onStrokesChange?.([])
  }

  const loadStrokes = (newStrokes, broadcast = false) => {
    strokesRef.current = Array.isArray(newStrokes) ? [...newStrokes] : []
    redraw()
    if (broadcast && strokesRef.current.length) {
      channelRef.current?._send?.({ t: 'sync', strokes: strokesRef.current })
    }
  }

  const exportBlob = async (mimeType = 'image/png') => {
    const c = canvasRef.current
    if (!c) return null
    return new Promise((resolve) => c.toBlob(resolve, mimeType))
  }

  const exportDataUrl = (mimeType = 'image/png') => {
    const c = canvasRef.current
    if (!c) return null
    return c.toDataURL(mimeType)
  }

  return {
    wrapRef,
    canvasRef,
    strokesRef,
    strokeCount,
    color,
    setColor,
    size,
    setSize,
    eraser,
    setEraser,
    connectionStatus,
    undo,
    clearAll,
    redraw,
    loadStrokes,
    exportBlob,
    exportDataUrl,
    canvasProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp,
    },
  }
}
