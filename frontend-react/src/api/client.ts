export interface AppConfig {
  host_name: string
  template_dir: string
  work_dir: string
  collector_installed: boolean
  collector_version: string
  collector_config_exists: boolean
  refinery_installed: boolean
  refinery_version: string
  refinery_config_exists: boolean
  refinery_rule_exists: boolean
  otel_collector: {
    bin_path: string
    config_path: string
  }
  refinery: {
    bin_path: string
    config_path: string
    rule_path: string
  }
}

export interface SendJsonResponse {
  message: string
  result?: unknown[]
  error?: boolean
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${url}`)
  }
  return response.json() as Promise<T>
}

async function requestText(url: string, init?: RequestInit): Promise<string> {
  const response = await fetch(url, init)
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${url}`)
  }
  return response.text()
}

export const fetchConfig = () => request<AppConfig>('/api/config')

export const fetchOtelcolVersions = () =>
  request<{ version: string }[]>('/api/otelcol_versions')

export const fetchRefineryVersions = () =>
  request<{ version: string }[]>('/api/refinery_versions')

export const fetchOtelcolVersion = () =>
  request<{ result: boolean; version: string }>('/api/otelcol_version')

export const fetchRefineryVersion = () =>
  request<{ result: boolean; version: string }>('/api/refinery_version')

export const fetchYaml = (path: string) =>
  requestText(`/api/get_yaml?path=${encodeURIComponent(path)}`)

export const fetchJsonFile = (path: string) =>
  request<unknown>(`/api/get_json?path=${encodeURIComponent(path)}`)

export const saveYaml = (path: string, content: string) =>
  request<{ message: string }>(`/api/save_yaml?path=${encodeURIComponent(path)}`, {
    method: 'POST',
    body: content,
    headers: { 'Content-Type': 'text/plain' },
  })

export const installOtelcol = (version: string) =>
  request<{ started: boolean; message: string }>(
    `/api/otelcol_install?version=${encodeURIComponent(version)}`,
  )

export const installRefinery = (version: string) =>
  request<{ started: boolean; message: string }>(
    `/api/refinery_install?version=${encodeURIComponent(version)}`,
  )

export const startOtelcol = () =>
  request<{ result: boolean; pid?: string; error?: string }>('/api/otelcol_start')

export const startRefinery = () =>
  request<{ result: boolean; pid?: string; error?: string; message?: string }>(
    '/api/refinery_start',
  )

export const stopProcess = (pid: string) =>
  request<{ status: string; message: string }>(`/api/stop?pid=${encodeURIComponent(pid)}`)

export const refreshProcess = (pid: string) =>
  request<{ message: string }>(`/api/refresh?pid=${encodeURIComponent(pid)}`)

export const fetchPids = () => request<string[][]>('/api/pids')

export const sendJson = (url: string, jsonData: string, headers: Record<string, string>) =>
  request<SendJsonResponse>(`/api/send_json?url=${encodeURIComponent(url)}`, {
    method: 'POST',
    body: jsonData,
    headers,
  })

export const fetchAiAssistantStatus = () =>
  request<{ result: boolean; type: string; message: string }>('/api/ai_assistant')

export type OtelModules = Record<string, string[]>

export const fetchOtelcolModules = (version?: string) => {
  const query = version ? `?version=${encodeURIComponent(version)}` : ''
  return request<OtelModules>(`/api/otelcol_modules${query}`)
}

export const fetchMarkdown = (url: string, asHtml = false) =>
  requestText(
    `/api/get_markdown?url=${encodeURIComponent(url)}${asHtml ? '&output=html' : ''}`,
  )

export const listSavedJson = () => request<string[]>('/api/list_saved_json')

export const getSavedJson = (name: string) =>
  request<unknown>(`/api/get_saved_json?name=${encodeURIComponent(name)}`)

export const saveSavedJson = (name: string, content: string) =>
  request<{ message: string }>(`/api/save_saved_json?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    body: content,
    headers: { 'Content-Type': 'application/json' },
  })

export const deleteSavedJson = (name: string) =>
  request<{ message: string }>(`/api/delete_saved_json?name=${encodeURIComponent(name)}`)

export function wsBase(hostName: string) {
  const protocol = hostName.includes('localhost') ? 'ws' : 'wss'
  return `${protocol}://${hostName}`
}
