import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { LIVE } from '../facts'
import { X207 } from './engine/x207.js'

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

/** Start from one line: three ways in, as a proper tablist (arrow keys, Home and End move between the tabs) over one terminal panel with a copy button. */
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

  return (
    <section className="section" id="build" aria-labelledby="build-h">
      <div className="col build">
        <div className="sechead">
          <h2 id="build-h">Start from one line.</h2>
          <p>Give your agent the read-only MCP server, call the read API, or run a whole epoch on your laptop in a local near-sandbox.</p>
        </div>
        <div>
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
          <div className="term" id="build-panel" role="tabpanel" aria-labelledby={`tab-${tab.key}`}>
            <button className="copy" type="button" onClick={copy}>{label}</button>
            <pre tabIndex={0}>
              {tab.lines.map((l, i) => (
                <span key={i}>
                  {i ? '\n' : ''}
                  {l.c ? <span className="c">{l.text}</span> : l.text}
                </span>
              ))}
            </pre>
          </div>
        </div>
      </div>
    </section>
  )
}
