import { useState } from 'react'

// FE-086: a file field drawn as a drop zone. The real file input covers the whole zone (invisible), so a click opens the browser's chooser and a file dropped
// on it lands in the input as usual; the zone only shows what is there: an empty prompt, or the chosen file with its size.

const sizeText = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`

type Props = { label: string; file: File | null; onFile: (file: File | null) => void; hint?: string; accept?: string }

export function FilePicker({ label, file, onFile, hint, accept }: Props) {
  const [over, setOver] = useState(false)
  return (
    <label className="file-pick" data-over={over ? 'true' : undefined} data-chosen={file ? 'true' : undefined}>
      <span>{label}</span>
      <span className="file-zone">
        <input
          type="file"
          accept={accept}
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          onDragEnter={() => setOver(true)}
          onDragLeave={() => setOver(false)}
          onDrop={() => setOver(false)}
        />
        <span className="file-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {file ? <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 14l2 2 4-4" /> : <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />}
          </svg>
        </span>
        <span className="file-text">
          <strong>{file ? file.name : 'Choose a file or drop it here'}</strong>
          <small>{file ? `${sizeText(file.size)}, click to replace` : hint ?? 'Any file type'}</small>
        </span>
      </span>
    </label>
  )
}
