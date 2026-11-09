import { useEffect, useState } from 'react'

/** FE-069: copies a long value (a hash, an account, a key) so nobody has to select a 64-character string by hand. The label says "Copied" for two seconds. */
export function CopyButton({ value, label = 'value' }: { value: string; label?: string }) {
  const [done, setDone] = useState<'ok' | 'fail' | null>(null)
  useEffect(() => {
    if (done === null) return
    const t = setTimeout(() => setDone(null), 2000)
    return () => clearTimeout(t)
  }, [done])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setDone('ok')
    } catch {
      setDone('fail')
    }
  }
  return (
    <button type="button" className="copy" onClick={copy} aria-label={`Copy ${label}`} title={`Copy ${label}`}>
      <span aria-live="polite">{done === 'ok' ? 'Copied' : done === 'fail' ? 'Copy failed' : 'Copy'}</span>
    </button>
  )
}
