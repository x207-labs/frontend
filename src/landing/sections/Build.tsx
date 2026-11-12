import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { gsap } from 'gsap'
import { LIVE } from '../facts'
import { X207 } from '../v4/engine/x207.js'
import { Horizon, Mac } from './Mac'

type Line = { c?: true; text: string }
type Tab = { key: string; label: string; lines: Line[] }

// One line per way in. A comment line (c) is shown dimmed and is left out when the visitor copies; so is a line that starts with ›, which is what you ask the agent.
const TABS: Tab[] = [
  {
    key: 'mcp',
    label: 'Claude or Codex',
    lines: [
      { c: true, text: '# read-only MCP server, six tools' },
      { text: `claude mcp add --transport http x207 ${LIVE.mcp}` },
      { text: '' },
      { c: true, text: '# then ask your agent' },
      { text: `› what did epoch ${X207.epoch} of ${X207.circle} clear?` },
    ],
  },
  {
    key: 'api',
    label: 'Read API',
    lines: [
      { c: true, text: `# epoch ${X207.epoch} and its 24 obligations` },
      { text: `curl ${X207.api}/epochs/${X207.epoch}` },
      { text: `curl ${X207.api}/epochs/${X207.epoch}/obligations` },
    ],
  },
  {
    key: 'local',
    label: 'Run locally',
    lines: [
      { c: true, text: '# local near-sandbox, no account, no Rust (Node 22.22.2+)' },
      { text: `git clone --recurse-submodules ${LIVE.repo}.git && cd x207` },
      { text: 'npm ci && npm run build --workspaces --if-present' },
      { text: 'npm run demo:quick' },
    ],
  },
]

const copyText = (tab: Tab) => tab.lines.filter((l) => !l.c && l.text && !l.text.startsWith('›')).map((l) => l.text).join('\n')

/** Start from one line, full screen: the claim and three ways in (a proper tablist: arrow keys, Home and End move between the tabs) over a terminal that rises out of
 * a horizon of agents, with a copy button. The lines of the chosen way in are typed out. */
export function Build() {
  const [active, setActive] = useState(0)
  const [label, setLabel] = useState('Copy')
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const reset = useRef(0)
  useEffect(() => () => window.clearTimeout(reset.current), [])

  const go = (i: number) => {
    setActive(i)
    tabs.current[i]?.focus()
  }
  const onKey = (e: KeyboardEvent) => {
    const last = TABS.length - 1
    const next = e.key === 'ArrowRight' ? (active === last ? 0 : active + 1) : e.key === 'ArrowLeft' ? (active === 0 ? last : active - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? last : -1
    if (next < 0) return
    e.preventDefault()
    go(next)
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyText(TABS[active]))
      setLabel('Copied')
    } catch {
      setLabel('Select and copy')
    }
    window.clearTimeout(reset.current)
    reset.current = window.setTimeout(() => setLabel('Copy'), 1600)
  }
  const tab = TABS[active]

  const sec = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const term = useRef<HTMLDivElement>(null)
  // on a wide screen the page pins the section: the terminal rises out of the horizon and the arc widens as you scroll
  useEffect(() => {
    const s = sec.current
    const st = stage.current
    const t = term.current
    if (!s || !st || !t) return
    const mm = gsap.matchMedia()
    mm.add('(min-width: 961px) and (prefers-reduced-motion: no-preference)', () => {
      s.dataset.fx = ''
      gsap
        .timeline({ scrollTrigger: { trigger: st, start: 'top top', end: '+=90%', pin: true, scrub: 0.8 } })
        .fromTo(t, { yPercent: 45, scale: 0.86, opacity: 0.4 }, { yPercent: 0, scale: 1, opacity: 1, ease: 'power3.out', duration: 1 })
        .fromTo(st.querySelector('.build-arc'), { scale: 0.82, opacity: 0.5 }, { scale: 1, opacity: 1, ease: 'none', duration: 1 }, 0)
        .to({}, { duration: 0.3 })
      return () => {
        delete s.dataset.fx
      }
    })
    return () => mm.revert()
  }, [])
  // the lines of the chosen way in are typed out, one after the other
  useEffect(() => {
    const lines = term.current?.querySelectorAll('.tline')
    if (!lines?.length || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const tw = gsap.fromTo(lines, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.45, ease: 'power2.out', stagger: 0.14 })
    return () => {
      tw.kill()
    }
  }, [active])

  return (
    <section className="build-sec" id="build" ref={sec} aria-labelledby="build-h">
      <div className="build-stage" ref={stage}>
        <Horizon className="build-arc" />
        <div className="build-copy">
          <h2 id="build-h" className="reveal-words">Start from one line.</h2>
          <p className="sub">Give your agent the read-only MCP server, call the read API, or run a whole epoch on your laptop in a local near-sandbox.</p>
          <div className="tabs" role="tablist" aria-label="Ways to start" onKeyDown={onKey}>
            {TABS.map((t, i) => (
              <button
                key={t.key}
                ref={(el) => {
                  tabs.current[i] = el
                }}
                id={`tab-${t.key}`}
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-controls="build-panel"
                tabIndex={i === active ? 0 : -1}
                onClick={() => setActive(i)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="build-term" ref={term}>
          <Mac title="zsh — x207" action={<button className="pill dark sm" type="button" onClick={copy}>{label}</button>}>
            <div className="term-body" id="build-panel" role="tabpanel" aria-labelledby={`tab-${tab.key}`}>
              <pre tabIndex={0} className="mono">
                {tab.lines.map((l, i) => (
                  <span key={`${tab.key}${i}`} className="tline">
                    {l.c ? <span className="dim">{l.text}</span> : l.text}
                    {'\n'}
                  </span>
                ))}
              </pre>
            </div>
          </Mac>
        </div>
      </div>
    </section>
  )
}
