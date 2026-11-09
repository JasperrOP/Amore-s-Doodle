import { useEffect, useState } from 'react'
import { doodleUrl } from '../lib/supabase'
export default function DoodleImage({ path, className = '', alt = 'doodle' }) {
  const [url, setUrl] = useState(null)
  useEffect(() => { let on = true; doodleUrl(path).then((u) => on && setUrl(u)); return () => { on = false } }, [path])
  if (!url) return <div className={`animate-pulse rounded-xl ${className}`} style={{ background: 'var(--line)', aspectRatio: '3/4' }} />
  return <img src={url} alt={alt} className={className} loading="lazy" />
}
