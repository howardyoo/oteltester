/* eslint-disable @typescript-eslint/no-explicit-any */

export function parseHeaderPairs(headersText: string): Record<string, string> {
  const headers: Record<string, string> = {}
  if (!headersText.trim()) return headers

  headersText.split(',').forEach((pair) => {
    const idx = pair.indexOf(':')
    if (idx > 0) {
      headers[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim()
    }
  })
  return headers
}

export function extractServiceName(jsonData: string): string | null {
  try {
    const json = JSON.parse(jsonData)
    if (!json.resourceMetrics) return null
    for (const resourceMetric of json.resourceMetrics) {
      for (const attribute of resourceMetric.resource?.attributes ?? []) {
        if (attribute.key === 'service.name' && attribute.value?.stringValue) {
          return attribute.value.stringValue
        }
      }
    }
  } catch {
    /* ignore parse errors */
  }
  return null
}

export function buildSendHeaders(
  apiKey: string,
  headersText: string,
  jsonData: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-honeycomb-team': apiKey,
    ...parseHeaderPairs(headersText),
  }
  const serviceName = extractServiceName(jsonData)
  if (serviceName) {
    headers['x-honeycomb-dataset'] = serviceName
  }
  return headers
}
