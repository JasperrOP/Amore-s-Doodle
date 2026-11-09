import { COLORS, SIZES } from './useDrawingCanvas'

export default function DrawingCanvas({
  canvasRef,
  wrapRef,
  canvasProps,
  readOnly = false,
  color,
  setColor,
  size,
  setSize,
  eraser,
  setEraser,
  toolbar = null,
  className = '',
}) {
  return (
    <div className={`w-full flex flex-col ${className}`}>
      <div ref={wrapRef} className="w-full relative select-none touch-none">
        <canvas
          ref={canvasRef}
          className="canvas-surface rounded-2xl w-full block shadow-xs"
          style={{
            border: '1.5px solid var(--line)',
            background: 'var(--paper)',
            cursor: readOnly ? 'default' : 'crosshair',
          }}
          {...canvasProps}
        />
      </div>

      {!readOnly && (
        <div className="card mt-3 space-y-3">
          {/* Color palette */}
          <div className="flex gap-2 flex-wrap items-center">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                onClick={() => {
                  setColor(c)
                  setEraser(false)
                }}
                className="transition-transform active:scale-95"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  background: c,
                  border: !eraser && color === c ? '3px solid var(--ink)' : '2px solid var(--line)',
                  boxShadow: !eraser && color === c ? '0 0 0 2px var(--surface)' : 'none',
                }}
              />
            ))}
          </div>

          {/* Size and Eraser */}
          <div className="flex gap-2 items-center">
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                aria-label={`Brush size ${s}`}
                onClick={() => setSize(s)}
                className="grid place-items-center transition-transform active:scale-95"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  background: 'var(--surface)',
                  border: size === s ? '2px solid var(--ink)' : '1.5px solid var(--line)',
                }}
              >
                <span
                  style={{
                    width: Math.min(s, 26),
                    height: Math.min(s, 26),
                    borderRadius: 999,
                    background: 'var(--ink)',
                  }}
                />
              </button>
            ))}

            <button
              type="button"
              className={`btn min-h-[44px] ${eraser ? '' : 'btn-ghost'}`}
              onClick={() => setEraser(!eraser)}
            >
              🧹 Eraser
            </button>
          </div>

          {/* Optional custom toolbar / action buttons */}
          {toolbar}
        </div>
      )}
    </div>
  )
}

