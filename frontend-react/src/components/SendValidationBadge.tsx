import { useState } from 'react'
import { Dialog } from './Dialog'
import { hasSendErrors, formatSendValidationHtml } from '../lib/sendValidation'
import type { SendJsonResponse } from '../api/client'

interface SendValidationBadgeProps {
  data: SendJsonResponse | null
  error?: string | null
}

export function SendValidationBadge({ data, error }: SendValidationBadgeProps) {
  const [open, setOpen] = useState(false)

  if (error) {
    return (
      <>
        <button type="button" className="btn btn--small btn--danger" onClick={() => setOpen(true)}>
          Has Error(s)
        </button>
        <Dialog open={open} title="Input Send Result" onClose={() => setOpen(false)} footer={
          <button type="button" className="btn btn--primary" onClick={() => setOpen(false)}>OK</button>
        }>
          <p>{error}</p>
        </Dialog>
      </>
    )
  }

  if (!data?.result) return null

  const hasError = hasSendErrors(data.result)

  return (
    <>
      <button
        type="button"
        className={`btn btn--small ${hasError ? 'btn--danger' : 'btn--success'}`}
        onClick={() => setOpen(true)}
      >
        {hasError ? 'Has Error(s)' : 'OK'}
      </button>
      <Dialog
        open={open}
        title="Input Send Result"
        onClose={() => setOpen(false)}
        footer={
          <button type="button" className="btn btn--primary" onClick={() => setOpen(false)}>
            OK
          </button>
        }
      >
        <div
          className="validation-result"
          dangerouslySetInnerHTML={{ __html: formatSendValidationHtml(data.result) }}
        />
      </Dialog>
    </>
  )
}
