import { useCallback, useEffect, useState, type ReactNode } from 'react'
import './Dialog.css'

interface DialogProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

export function Dialog({ open, title, onClose, children, footer }: DialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div className="dialog-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="dialog-container" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <button type="button" className="dialog-close-button" onClick={onClose} aria-label="Close">
          ❎
        </button>
        <h1 id="dialog-title" className="dialog-title">
          {title}
        </h1>
        <div className="dialog-content">{children}</div>
        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </>
  )
}

export function useDialog() {
  const [open, setOpen] = useState(false)
  const openDialog = useCallback(() => setOpen(true), [])
  const closeDialog = useCallback(() => setOpen(false), [])
  return { open, openDialog, closeDialog, setOpen }
}
