// FE-068: a "Feedback" button in the shell. The message goes to the account service without a signature (the account stays unknown), with the path of the page.
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import './feedback.css'
import { accountErrorMessage, sendFeedback } from './client'

const HIDDEN_ON = ['/', '/sign']

export function FeedbackButton() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'failed'; text: string }>({ kind: 'idle' })
  const field = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) field.current?.focus()
  }, [open])

  if (HIDDEN_ON.includes(pathname)) return null
  const trimmed = message.trim()

  async function send() {
    setState({ kind: 'sending' })
    try {
      await sendFeedback(pathname, trimmed)
      setState({ kind: 'sent' })
      setMessage('')
    } catch (e) {
      setState({ kind: 'failed', text: accountErrorMessage(e) })
    }
  }

  return (
    <div className="feedback" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      {open && (
        <form
          className="feedback-panel"
          aria-label="Send feedback"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <label>
            <span>What should we know?</span>
            <textarea ref={field} value={message} onChange={(e) => { setMessage(e.target.value); if (state.kind !== 'sending') setState({ kind: 'idle' }) }} maxLength={2000} rows={4} />
          </label>
          <small>Sent without your account. Page: {pathname}</small>
          <div className="feedback-actions">
            <button type="submit" disabled={trimmed === '' || state.kind === 'sending'}>{state.kind === 'sending' ? 'Sending…' : 'Send'}</button>
            <button type="button" onClick={() => setOpen(false)}>Close</button>
          </div>
          {state.kind === 'sent' && <p className="state" role="status">Thank you, it was sent.</p>}
          {state.kind === 'failed' && <p className="state-error" role="alert">{state.text}</p>}
        </form>
      )}
      <button type="button" className="feedback-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Feedback
      </button>
    </div>
  )
}
