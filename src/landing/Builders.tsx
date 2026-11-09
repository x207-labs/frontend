import { AnimatePresence, m } from 'motion/react'
import { useEffect, useState } from 'react'
import { LIVE } from './facts'
import { Reveal } from './motion'
import { SPRING_PRESS } from './tokens'

// FE-044: two lines a builder can paste. Both are copied from README.md as they stand.
const SNIPPETS = [
  {
    title: 'Pay from an agent',
    note: 'One line on the x402Client the agent already has.',
    lang: 'ts',
    code: 'const client = new x402Client().register("x207:agents-main", new X207SchemeClient({ payer: "agent.near", secretKey }));',
  },
  {
    title: 'Read a circle from Claude',
    note: 'The read-only MCP server: circles, epochs and positions.',
    lang: 'sh',
    code: `claude mcp add --transport http x207 ${LIVE.mcp}`,
  },
]

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setDone(false), 1600)
    return () => clearTimeout(t)
  }, [done])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
    } catch {
      setDone(false)
    }
  }
  return (
    <m.button type="button" className="copy" onClick={copy} whileTap={{ scale: 0.92 }} transition={SPRING_PRESS} aria-label={done ? 'Copied' : `Copy: ${label}`}>
      <AnimatePresence mode="wait" initial={false}>
        <m.span key={done ? 'done' : 'copy'} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={SPRING_PRESS}>
          {done ? 'Copied' : 'Copy'}
        </m.span>
      </AnimatePresence>
    </m.button>
  )
}

export function Builders() {
  return (
    <section id="build" className="section build" aria-labelledby="build-title">
      <Reveal>
        <p className="eyebrow">Build</p>
        <h2 id="build-title" className="section-title">Start from one line.</h2>
      </Reveal>
      <div className="snippets">
        {SNIPPETS.map((s, i) => (
          <Reveal key={s.title} delay={i * 0.08} className="snippet glass">
            <div className="snippet-head">
              <div>
                <h3>{s.title}</h3>
                <p>{s.note}</p>
              </div>
              <Copy text={s.code} label={s.title} />
            </div>
            <pre tabIndex={0} aria-label={s.title}><code className={`lang-${s.lang}`}>{s.code}</code></pre>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
