import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'

const DialogCtx = createContext(null)
export const useDialog = () => useContext(DialogCtx)

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null) // { title, message, confirmText, cancelText, danger, resolve }
  const [toasts, setToasts] = useState([]) // [{ id, message, type }]
  const shouldReduceMotion = useReducedMotion()
  const toastIdRef = useRef(0)

  const confirm = useCallback(
    ({ title = 'Confirm', message = '', confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) => {
      return new Promise((resolve) => {
        setDialog({
          title,
          message,
          confirmText,
          cancelText,
          danger,
          resolve: (val) => {
            setDialog(null)
            resolve(val)
          },
        })
      })
    },
    []
  )

  const alert = useCallback(
    ({ title = 'Notice', message = '', buttonText = 'OK' }) => {
      return new Promise((resolve) => {
        setDialog({
          title,
          message,
          confirmText: buttonText,
          cancelText: null, // no cancel button for alert
          danger: false,
          resolve: () => {
            setDialog(null)
            resolve()
          },
        })
      })
    },
    []
  )

  const showToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = ++toastIdRef.current
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, duration)
  }, [])

  return (
    <DialogCtx.Provider value={{ confirm, alert, toast: showToast }}>
      {children}

      {/* Custom Confirmation / Alert Dialog */}
      <AnimatePresence>
        {dialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-xs"
              onClick={() => dialog.resolve(false)}
            />

            {/* Modal Card */}
            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="card relative max-w-sm w-full p-5 space-y-3 shadow-2xl z-10"
              style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}
              role="alertdialog"
              aria-modal="true"
            >
              <h3 className="text-lg font-bold">{dialog.title}</h3>
              {dialog.message && <p className="text-sm muted whitespace-pre-wrap">{dialog.message}</p>}

              <div className="flex gap-2 pt-2 justify-end">
                {dialog.cancelText && (
                  <button
                    type="button"
                    className="btn btn-ghost !min-h-[44px] flex-1"
                    onClick={() => dialog.resolve(false)}
                  >
                    {dialog.cancelText}
                  </button>
                )}
                <button
                  type="button"
                  className={`btn !min-h-[44px] flex-1 ${dialog.danger ? 'btn-danger' : ''}`}
                  onClick={() => dialog.resolve(true)}
                  autoFocus
                >
                  {dialog.confirmText}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Toast Notifications */}
      <div className="fixed top-4 inset-x-4 z-50 pointer-events-none flex flex-col items-center gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-auto px-4 py-2.5 rounded-full shadow-lg text-sm font-medium border"
              style={{
                background: t.type === 'error' ? 'var(--danger)' : 'var(--primary)',
                color: '#fff',
                borderColor: 'var(--line)',
              }}
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </DialogCtx.Provider>
  )
}

