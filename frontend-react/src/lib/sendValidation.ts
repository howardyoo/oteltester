import type { SendJsonResponse } from '../api/client'

export function hasSendErrors(result: unknown[] | undefined): boolean {
  if (!result) return false
  return result.some((item) => {
    if (typeof item === 'object' && item !== null && 'error' in item) {
      return Boolean((item as { error?: boolean }).error)
    }
    return false
  })
}

export function formatSendValidationHtml(result: unknown[]): string {
  let html = ''
  result.forEach((raw, index) => {
    const r = raw as Record<string, unknown>
    html += `<div><h3>OTEL Input No. ${index + 1}</h3><ul>`
    html += `<li>OTEL JSON Validation: ${r.validation === true ? '✅ Valid' : '❌ Invalid'}</li>`
    html += `<li>Message was sent: ${r.sent === true ? '✅ Yes' : '❌ No'}</li>`
    html += `<li>Message: ${r.error === true ? '❌' : '✅'} ${String(r.message ?? '')}</li>`
    if (Array.isArray(r.errors)) {
      html += '<li><h4>🛑 Errors</h4><ul>'
      for (const e of r.errors as Record<string, unknown>[]) {
        html += `<li>Instance Path: ${String(e.instancePath ?? '')}</li>`
        html += `<li>Schema Path: ${String(e.schemaPath ?? '')}</li>`
        html += `<li>Keyword: ${String(e.keyword ?? '')}</li>`
        html += `<li>Params: ${JSON.stringify(e.params ?? {})}</li>`
        html += `<li>Message: ${String(e.message ?? '')}</li>`
      }
      html += '</ul></li>'
    }
    html += '</ul></div>'
  })
  return html
}

export function formatSendValidationSummary(data: SendJsonResponse): string {
  return data.message || 'Send completed'
}
