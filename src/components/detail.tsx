import { createContext, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// FE-054: the optional right-hand detail panel. The layout owns the slot; a page that has a selected row renders <DetailPanel> and its children appear in the slot
// (a column next to the content from 1200 px, below the content under that). A page that renders nothing leaves the slot empty and hidden.
const SlotContext = createContext<{ slot: HTMLElement | null; setSlot: (el: HTMLElement | null) => void }>({ slot: null, setSlot: () => undefined })

export function DetailSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  return <SlotContext.Provider value={{ slot, setSlot }}>{children}</SlotContext.Provider>
}

/** The element the panel content is rendered into. */
export function DetailSlot({ label = 'Details' }: { label?: string }) {
  const { setSlot } = useContext(SlotContext)
  return <aside className="detail" aria-label={label} ref={setSlot} />
}

export function DetailPanel({ children }: { children: ReactNode }) {
  const { slot } = useContext(SlotContext)
  return slot ? createPortal(children, slot) : null
}
