import { useEffect, useState } from 'react'

export default function InstallHint() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    const isStandalone =
      window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches
    const dismissed = localStorage.getItem('ios_install_dismissed')

    if (isIos && !isStandalone && !dismissed) {
      setShow(true)
    }
  }, [])

  const dismiss = () => {
    localStorage.setItem('ios_install_dismissed', 'true')
    setShow(false)
  }

  if (!show) return null

  return (
    <aside
      aria-label="Install App"
      className="fixed bottom-20 inset-x-3 z-50 max-w-md mx-auto p-3.5 rounded-2xl shadow-xl flex items-center justify-between gap-3 border animate-in slide-in-from-bottom duration-300"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--line)',
        color: 'var(--ink)',
      }}
    >
      <div className="flex items-center gap-3">
        <div className="text-2xl shrink-0">📲</div>
        <div className="text-xs leading-snug">
          <span className="font-bold block">Install on your iPhone:</span>
          Tap <span className="font-bold underline">Share</span> (⎋ / ⬆️) in Safari, then select{' '}
          <span className="font-bold">&ldquo;Add to Home Screen&rdquo;</span> (➕).
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="btn btn-ghost !min-h-[36px] !px-3 text-xs shrink-0"
        aria-label="Dismiss install prompt"
      >
        Got it
      </button>
    </aside>
  )
}

