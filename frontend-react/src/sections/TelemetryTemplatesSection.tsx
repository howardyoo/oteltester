import { useCallback, useEffect, useState } from 'react'
import {
  deleteSavedJson,
  fetchJsonFile,
  getSavedJson,
  listSavedJson,
  saveSavedJson,
  sendJson,
} from '../api/client'
import { useApp } from '../context/AppContext'
import { AiAssistant } from '../components/AiAssistant'
import { CollapsibleSection } from '../components/CollapsibleSection'
import { CodeEditor } from '../components/CodeEditor'
import { Dialog, useDialog } from '../components/Dialog'
import { SendValidationBadge } from '../components/SendValidationBadge'
import { useRegisterUiSync } from '../hooks/useRegisterUiSync'
import { useHistoryList } from '../hooks/useHistoryList'
import { extractCodeBlock, OTEL_INPUT_SYSTEM_PROMPT, type ChatMessage } from '../lib/aiPrompts'
import { applyTemplate } from '../lib/template'
import { buildSendHeaders } from '../lib/otelSend'
import type { SendJsonResponse } from '../api/client'

const TRACE_TEMPLATES = [
  { label: 'Simple Trace', file: 'simple_trace.json' },
  { label: 'Medium Trace', file: 'medium_trace.json' },
  { label: 'Trace and Log Combo', file: 'combo_trace_log.json' },
] as const

const METRIC_TEMPLATES = [{ label: 'Simple Metric', file: 'simple_metric.json' }] as const
const LOG_TEMPLATES = [{ label: 'Simple Log', file: 'simple_log.json' }] as const

interface InputHistoryItem {
  content: string
  sendResult?: string
  validation?: SendJsonResponse
  error?: string
}

export function TelemetryTemplatesSection() {
  const { config } = useApp()
  const [otelInput, setOtelInput] = useState('')
  const [endpoint, setEndpoint] = useState('http://localhost:4318')
  const [apiKey, setApiKey] = useState('1234567890')
  const [headersText, setHeadersText] = useState('')
  const [newIds, setNewIds] = useState(true)
  const [stripTime, setStripTime] = useState(true)
  const [timerSec, setTimerSec] = useState(0)
  const [sending, setSending] = useState(false)
  const [sendStatus, setSendStatus] = useState('')
  const [validation, setValidation] = useState<SendJsonResponse | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [saveName, setSaveName] = useState('')
  const [savedFiles, setSavedFiles] = useState<string[]>([])
  const [aiSystemPrompt, setAiSystemPrompt] = useState<ChatMessage[]>(OTEL_INPUT_SYSTEM_PROMPT)
  const inputHistory = useHistoryList<InputHistoryItem>()

  const saveDialog = useDialog()
  const openDialog = useDialog()

  const loadSavedFiles = useCallback(async () => {
    try {
      setSavedFiles(await listSavedJson())
    } catch {
      setSavedFiles([])
    }
  }, [])

  useEffect(() => {
    if (!config?.template_dir) return
    const files = ['simple_trace.json', 'simple_metric.json', 'simple_log.json', 'combo_trace_log.json']
    Promise.all(
      files.map((file) =>
        fetchJsonFile(`${config.template_dir}/${file}`).then((json) => ({ file, json })),
      ),
    )
      .then((examples) => {
        const prompt = [...OTEL_INPUT_SYSTEM_PROMPT]
        for (const { file, json } of examples) {
          prompt.push({
            role: 'system',
            content: `Example ${file}:\n\`\`\`json\n${JSON.stringify(json, null, 2)}\n\`\`\``,
          })
        }
        setAiSystemPrompt(prompt)
      })
      .catch(() => {})
  }, [config?.template_dir])

  useRegisterUiSync({
    setOtelInput: (json: string) => setOtelInput(json),
    appendOtelInput: (json: string) => {
      setOtelInput(json)
      inputHistory.append({ content: json })
    },
    showOtelInputValidation: (data: SendJsonResponse) => {
      setValidation(data)
      setValidationError(null)
    },
  })

  const loadTemplate = useCallback(
    async (file: string) => {
      if (!config?.template_dir) return
      try {
        const json = await fetchJsonFile(`${config.template_dir}/${file}`)
        setOtelInput(JSON.stringify(json, null, 2))
      } catch (err) {
        console.error('Failed to load template:', err)
      }
    },
    [config?.template_dir],
  )

  const handleSend = useCallback(async () => {
    if (!otelInput.trim()) return

    setSending(true)
    setSendStatus('Sending...')
    setValidation(null)
    setValidationError(null)

    try {
      const parsed = JSON.parse(otelInput)
      const processed = applyTemplate(parsed, newIds, stripTime)
      const jsonData = JSON.stringify(processed)
      const headers = buildSendHeaders(apiKey, headersText, jsonData)
      const data = await sendJson(endpoint, jsonData, headers)
      setSendStatus(data.message)
      setValidation(data)
      inputHistory.append({ content: otelInput, sendResult: data.message, validation: data })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Send failed'
      setSendStatus(`❌ ${message}`)
      setValidationError(message)
      inputHistory.append({ content: otelInput, error: message })
    } finally {
      setSending(false)
    }
  }, [otelInput, newIds, stripTime, apiKey, headersText, endpoint, inputHistory])

  useEffect(() => {
    if (timerSec <= 0) return
    const timer = setInterval(handleSend, timerSec * 1000)
    return () => clearInterval(timer)
  }, [timerSec, handleSend])

  const handleHistoryChange = (index: number) => {
    inputHistory.select(index)
    const item = inputHistory.items[index]
    if (item) {
      setOtelInput(item.content)
      setSendStatus(item.sendResult ?? item.error ?? '')
      setValidation(item.validation ?? null)
      setValidationError(item.error ?? null)
    }
  }

  const handleSave = async () => {
    if (!saveName.trim() || !otelInput.trim()) return
    try {
      const data = await saveSavedJson(saveName.trim(), otelInput)
      saveDialog.closeDialog()
      setSaveName('')
      alert(data.message)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save failed')
    }
  }

  const handleOpen = async (name: string) => {
    try {
      const data = await getSavedJson(name)
      setOtelInput(JSON.stringify(data, null, 2))
      openDialog.closeDialog()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Open failed')
    }
  }

  const handleDelete = async (name: string) => {
    try {
      await deleteSavedJson(name)
      await loadSavedFiles()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const aiExtraPrompt = () => {
    if (!otelInput.trim()) return []
    return [
      {
        role: 'system' as const,
        content: `The following is the current JSON data for the otel collector. Use this as a base to generate the next JSON data:\n\`\`\`json\n${otelInput}\n\`\`\``,
      },
    ]
  }

  return (
    <CollapsibleSection id="section-templates" title="🥣 Telemetry Templates">
      <div className="template-groups">
        <div className="template-group">
          <h3 className="subsection-title">🐾 Traces</h3>
          <div className="pill-buttons">
            {TRACE_TEMPLATES.map(({ label, file }) => (
              <button key={file} type="button" className="pill-btn" onClick={() => loadTemplate(file)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="template-group">
          <h3 className="subsection-title">📈 Metrics</h3>
          <div className="pill-buttons">
            {METRIC_TEMPLATES.map(({ label, file }) => (
              <button key={file} type="button" className="pill-btn" onClick={() => loadTemplate(file)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="template-group">
          <h3 className="subsection-title">🪵 Logs</h3>
          <div className="pill-buttons">
            {LOG_TEMPLATES.map(({ label, file }) => (
              <button key={file} type="button" className="pill-btn" onClick={() => loadTemplate(file)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="split-row split-row--mt">
        <div className="panel">
          <div className="panel-header">
            <h3 className="subsection-title">📝 OTEL Input</h3>
            <div className="panel-header__actions">
              <button type="button" className="btn btn--small" onClick={() => setOtelInput('')}>
                Clear
              </button>
              <button type="button" className="btn btn--small" onClick={saveDialog.openDialog}>
                Save
              </button>
              <button
                type="button"
                className="btn btn--small"
                onClick={() => {
                  loadSavedFiles()
                  openDialog.openDialog()
                }}
              >
                Open
              </button>
              <SendValidationBadge data={validation} error={validationError} />
            </div>
          </div>
          <CodeEditor value={otelInput} onChange={setOtelInput} language="json" minHeight="320px" />
          <div className="control-row control-row--stack">
            <div className="control-row">
              <span aria-hidden="true">📡</span>
              <select className="select-input" value={endpoint} onChange={(e) => setEndpoint(e.target.value)}>
                <option value="http://localhost:4318">Local OTEL collector</option>
                <option value="https://api.honeycomb.io">https://api.honeycomb.io</option>
                <option value="https://api.eu1.honeycomb.io">https://api.eu1.honeycomb.io</option>
              </select>
              <label className="inline-label">
                API Key
                <input
                  type="password"
                  className="text-input"
                  placeholder="API Key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleSend}
                disabled={sending || !otelInput.trim()}
              >
                ⏵ Send
              </button>
              {inputHistory.items.length > 0 && (
                <label className="inline-label">
                  Inputs
                  <select
                    className="select-input"
                    value={inputHistory.selectedIndex}
                    onChange={(e) => handleHistoryChange(Number(e.target.value))}
                  >
                    {inputHistory.items.map((_, i) => (
                      <option key={i} value={i}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {sendStatus && <span className="muted">{sendStatus}</span>}
            </div>
            <div className="control-row">
              <label className="inline-label inline-label--grow">
                Headers
                <input
                  type="text"
                  className="text-input text-input--wide"
                  placeholder="(key:value,...)"
                  value={headersText}
                  onChange={(e) => setHeadersText(e.target.value)}
                />
              </label>
            </div>
            <div className="control-row">
              <label className="checkbox-label">
                <input type="checkbox" checked={newIds} onChange={(e) => setNewIds(e.target.checked)} />
                New trace and span id
              </label>
              <label className="checkbox-label">
                <input type="checkbox" checked={stripTime} onChange={(e) => setStripTime(e.target.checked)} />
                Re-time timestamps
              </label>
              <label className="inline-label">
                Timer
                <select
                  className="select-input"
                  value={timerSec}
                  onChange={(e) => setTimerSec(Number(e.target.value))}
                >
                  <option value={0}>Off</option>
                  <option value={5}>5s</option>
                  <option value={10}>10s</option>
                  <option value={30}>30s</option>
                  <option value={60}>1m</option>
                  <option value={300}>5m</option>
                  <option value={600}>10m</option>
                  <option value={1800}>30m</option>
                  <option value={3600}>1h</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        <AiAssistant
          idPrefix="otel_input"
          systemPrompt={aiSystemPrompt}
          extraPrompt={aiExtraPrompt}
          onComplete={(text) => {
            const block = extractCodeBlock(text)
            if (!block) return
            try {
              setOtelInput(JSON.stringify(JSON.parse(block), null, 2))
            } catch {
              setOtelInput(block)
            }
          }}
        />
      </div>

      <Dialog
        open={saveDialog.open}
        title="Save OTEL Input"
        onClose={saveDialog.closeDialog}
        footer={
          <button type="button" className="btn btn--primary" onClick={handleSave}>
            Save
          </button>
        }
      >
        <p className="muted">
          Please provide a name for the OTEL input. If the name already exists, the input will be overwritten.
        </p>
        <input
          type="text"
          className="text-input text-input--wide"
          placeholder="OTEL Input Name"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
        />
      </Dialog>

      <Dialog open={openDialog.open} title="Open OTEL Input" onClose={openDialog.closeDialog}>
        <div className="open-dialog-content">
          {savedFiles.length === 0 ? (
            <p className="muted">No saved OTEL data found.</p>
          ) : (
            <>
              <p className="muted">Please select a saved OTEL data to open.</p>
              {savedFiles.map((file) => (
                <div key={file} className="saved-file-row">
                  <button type="button" className="btn btn--outline" onClick={() => handleOpen(file)}>
                    {file}
                  </button>
                  <button type="button" className="btn btn--small btn--danger" onClick={() => handleDelete(file)}>
                    ✕
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </Dialog>
    </CollapsibleSection>
  )
}
