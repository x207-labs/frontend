import { AnimatePresence, m } from 'motion/react'
import { useEffect, useState } from 'react'
import { LIVE } from './facts'
import { SectionFigure } from './figures'
import { Icon, type IconName } from './icons'
import { Reveal } from './motion'
import { SPRING_PRESS } from './tokens'

// FE-044, FE-051: two lines a builder can paste. Both are copied from README.md as they stand.
const SNIPPETS: { title: string; icon: IconName; file: string; lang: string; code: string }[] = [
  {
    title: 'Pay from an agent',
    icon: 'agent',
    file: 'agent.ts',
    lang: 'ts',
    code: 'const client = new x402Client().register("x207:agents-main", new X207SchemeClient({ payer: "agent.near", secretKey }));',
  },
  {
    title: 'Read a circle from Claude',
    icon: 'terminal',
    file: 'shell',
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
          <Icon name={done ? 'check' : 'copy'} />
          {done ? 'Copied' : 'Copy'}
        </m.span>
      </AnimatePresence>
    </m.button>
  )
}

export function Builders() {
  return (
    <section id="build" className="section build" aria-labelledby="build-title">
      <p className="section-kicker">
        Fig. 07 <span>Build</span>
      </p>
      <SectionFigure name="window" />
      <h2 id="build-title" className="section-title">Start from one line.</h2>
      <div className="snippets">
        {SNIPPETS.map((s, i) => (
          <Reveal key={s.title} delay={i * 0.08} className="snippet glass">
            <div className="snippet-head">
              <h3>
                <Icon name={s.icon} />
                {s.title}
                <span className="snippet-file">{s.file}</span>
              </h3>
              <Copy text={s.code} label={s.title} />
            </div>
            <pre tabIndex={0} aria-label={s.title}><code className={`lang-${s.lang}`}>{s.code}</code></pre>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
