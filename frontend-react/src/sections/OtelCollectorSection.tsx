import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchYaml,
  refreshProcess,
  saveYaml,
  sendJson,
  startOtelcol,
  stopProcess,
  type SendJsonResponse,
} from '../api/client'
import { useApp } from '../context/AppContext'
import { CollapsibleSection } from '../components/CollapsibleSection'
import { CodeEditor } from '../components/CodeEditor'
import { ModuleEditors } from '../components/ModuleEditor'
import { SendValidationBadge } from '../components/SendValidationBadge'
import { useRegisterUiSync } from '../hooks/useRegisterUiSync'
import { useHistoryList } from '../hooks/useHistoryList'
import { useWebSocket } from '../hooks/useWebSocket'
import { buildSendHeaders } from '../lib/otelSend'
import { getOtelbinUrl } from '../lib/otelbin'

function statusIcon(ok: boolean | undefined) {
  return ok ? '✅' : '❌'
}

export function OtelCollectorSection() {
  const { config, loading, otelcolProcess } = useApp()
  const collector = config?.otel_collector

  const [configYaml, setConfigYaml] = useState('')
  const [savedYaml, setSavedYaml] = useState('')
  const [configDirty, setConfigDirty] = useState(false)
  const [resultJson, setResultJson] = useState('')
  const [sendEndpoint, setSendEndpoint] = useState('http://localhost:8080')
  const [apiKey, setApiKey] = useState('1234567890')
  const [headersText, setHeadersText] = useState('')
  const [sendAuto, setSendAuto] = useState(false)
  const [sendStatus, setSendStatus] = useState('')
  const [sending, setSending] = useState(false)
  const [actionPending, setActionPending] = useState(false)
  const [resultValidation, setResultValidation] = useState<SendJsonResponse | null>(null)
  const [resultValidationError, setResultValidationError] = useState<string | null>(null)

  const configHistory = useHistoryList<string>()
  const resultHistory = useHistoryList<string>()
  const resultHistoryAppend = useRef(resultHistory.append)
  resultHistoryAppend.current = resultHistory.append

  useRegisterUiSync({
    setOtelcolConfig: (yaml: string) => {
      setConfigYaml(yaml)
      setConfigDirty(yaml !== savedYaml)
      configHistory.append(yaml)
    },
    refreshOtelcol: () => {
      if (!collector) return
      fetchYaml(collector.config_path)
        .then((yaml) => {
          setConfigYaml(yaml)
          setSavedYaml(yaml)
          configHistory.append(yaml)
          setConfigDirty(false)
        })
        .catch(console.error)
    },
  })

  const consoleWs = useWebSocket({
    hostName: config?.host_name,
    path: '/otelcol_stdout',
    enabled: !!config,
  })

  const handleOtelcolOutput = useCallback(
    (message: string) => {
      setResultJson(message)
      resultHistoryAppend.current(message)

      if (sendAuto && message.trim()) {
        const headers = buildSendHeaders(apiKey, headersText, message)
        setSendStatus('Sending...')
        sendJson(sendEndpoint, message, headers)
          .then((data) => {
            setSendStatus(data.message)
            setResultValidation(data)
            setResultValidationError(null)
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : 'Send failed'
            setSendStatus(msg)
            setResultValidationError(msg)
          })
          .finally(() => setSending(false))
      }
    },
    [sendAuto, apiKey, headersText, sendEndpoint],
  )

  useWebSocket({
    hostName: config?.host_name,
    path: '/otelcol_out',
    enabled: !!config,
    mode: 'replace',
    onMessage: handleOtelcolOutput,
  })

  useEffect(() => {
    if (!config?.collector_config_exists || !collector) return
    fetchYaml(collector.config_path)
      .then((yaml) => {
        setConfigYaml(yaml)
        setSavedYaml(yaml)
        configHistory.setItems([yaml])
        configHistory.select(0)
        setConfigDirty(false)
      })
      .catch(console.error)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.collector_config_exists, collector?.config_path])

  const handleConfigChange = (value: string) => {
    setConfigYaml(value)
    setConfigDirty(value !== savedYaml)
  }

  const handleStart = async () => {
    setActionPending(true)
    try {
      const data = await startOtelcol()
      if (!data.result) console.error(data.error)
    } finally {
      setActionPending(false)
    }
  }

  const handleStop = async () => {
    if (!otelcolProcess.pid) return
    setActionPending(true)
    try {
      await stopProcess(otelcolProcess.pid)
    } finally {
      setActionPending(false)
    }
  }

  const handleSave = async () => {
    if (!collector) return
    setActionPending(true)
    try {
      await saveYaml(collector.config_path, configYaml)
      setSavedYaml(configYaml)
      setConfigDirty(false)
      if (configHistory.selectedItem !== configYaml) {
        configHistory.append(configYaml)
      }
    } finally {
      setActionPending(false)
    }
  }

  const handleReload = async () => {
    if (!otelcolProcess.pid || !collector) return
    setActionPending(true)
    try {
      if (configDirty) {
        await saveYaml(collector.config_path, configYaml)
        setSavedYaml(configYaml)
        setConfigDirty(false)
      }
      await refreshProcess(otelcolProcess.pid)
    } finally {
      setActionPending(false)
    }
  }

  const handleReset = async () => {
    if (!collector) return
    setActionPending(true)
    try {
      const yaml = await fetchYaml('./examples/otelcol-config.yml')
      await saveYaml(collector.config_path, yaml)
      setConfigYaml(yaml)
      setSavedYaml(yaml)
      setConfigDirty(false)
      configHistory.append(yaml)
    } finally {
      setActionPending(false)
    }
  }

  const handleManualSend = async () => {
    if (!resultJson.trim()) return
    setSending(true)
    setSendStatus('Sending...')
    setResultValidation(null)
    setResultValidationError(null)
    try {
      const headers = buildSendHeaders(apiKey, headersText, resultJson)
      const data = await sendJson(sendEndpoint, resultJson, headers)
      setSendStatus(data.message)
      setResultValidation(data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Send failed'
      setSendStatus(msg)
      setResultValidationError(msg)
    } finally {
      setSending(false)
    }
  }

  const handleExportOtelbin = () => {
    const url = getOtelbinUrl(configYaml, config?.collector_version)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleConfigHistoryChange = (index: number) => {
    configHistory.select(index)
    const item = configHistory.items[index]
    if (item) {
      setConfigYaml(item)
      setConfigDirty(item !== savedYaml)
    }
  }

  const handleResultHistoryChange = (index: number) => {
    resultHistory.select(index)
    const item = resultHistory.items[index]
    if (item) setResultJson(item)
  }

  return (
    <CollapsibleSection id="section-collector" title="🕸️ Otel Collector">
      {loading && <p className="muted">Loading collector status...</p>}

      {!loading && collector && (
        <>
          <ul className="file-status-list">
            <li>
              {statusIcon(config?.collector_installed)} bin: {collector.bin_path}
            </li>
            <li>
              {statusIcon(config?.collector_config_exists)} config: {collector.config_path}
            </li>
          </ul>

          <div
            className={`status-badge ${otelcolProcess.running ? 'status-badge--running' : 'status-badge--stopped'}`}
          >
            {otelcolProcess.running ? (
              <>
                🟢 Running
                {otelcolProcess.debugUrl && (
                  <>
                    {' '}
                    |{' '}
                    <a href={otelcolProcess.debugUrl} target="_blank" rel="noopener noreferrer">
                      Debug Page
                    </a>
                  </>
                )}
              </>
            ) : (
              '🔴 Stopped'
            )}
          </div>

          <div className="control-row control-row--wrap">
            <button
              type="button"
              className="btn"
              onClick={handleStart}
              disabled={!config?.collector_installed || otelcolProcess.running || actionPending}
            >
              ⏵ Start
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleStop}
              disabled={!otelcolProcess.running || actionPending}
            >
              ⏹ Stop
            </button>
            <button type="button" className="btn" onClick={handleSave} disabled={!configDirty || actionPending}>
              💾 Save Config
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleReload}
              disabled={!otelcolProcess.running || actionPending}
            >
              ⏎ Reload Config
            </button>
            <button type="button" className="btn" onClick={handleReset} disabled={actionPending}>
              Reset Config
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                consoleWs.clear()
                setResultJson('')
                resultHistory.setItems([])
                setSendStatus('')
                setResultValidation(null)
                setResultValidationError(null)
              }}
            >
              🧹 Clear Outputs
            </button>
            <button type="button" className="btn" onClick={handleExportOtelbin} disabled={!configYaml.trim()}>
              📡 Export to otelbin.io
            </button>
          </div>

          <ModuleEditors
            collectorVersion={config?.collector_version ?? '0.0.0'}
            configYaml={configYaml}
          />

          <div className="panel panel--full panel--mt">
            <div className="panel-header">
              <h4 className="panel-subtitle">
                ⚙️ {collector.config_path}
                {configHistory.items.length > 0 && (
                  <>
                    <span className="panel-subtitle__meta">Version</span>
                    <select
                      className="select-input select-input--small"
                      value={configHistory.selectedIndex}
                      onChange={(e) => handleConfigHistoryChange(Number(e.target.value))}
                    >
                      {configHistory.items.map((_, i) => (
                        <option key={i} value={i}>
                          {i + 1}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </h4>
            </div>
            <CodeEditor value={configYaml} onChange={handleConfigChange} language="yaml" minHeight="320px" />
          </div>

          <div className="split-row split-row--mt">
            <div className="panel">
              <div className="panel-header">
                <h4 className="panel-subtitle">🖥️ Console Output</h4>
                <button type="button" className="btn btn--small" onClick={consoleWs.clear}>
                  Clear
                </button>
              </div>
              <CodeEditor value={consoleWs.text} language="yaml" readOnly minHeight="320px" />
            </div>

            <div className="panel">
              <div className="panel-header">
                <h4 className="panel-subtitle">📢 Otelcol Result</h4>
                <div className="panel-header__actions">
                  <SendValidationBadge data={resultValidation} error={resultValidationError} />
                  <button
                    type="button"
                    className="btn btn--small"
                    onClick={() => {
                      setResultJson('')
                      resultHistory.setItems([])
                      setResultValidation(null)
                      setResultValidationError(null)
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <CodeEditor value={resultJson} onChange={setResultJson} language="json" minHeight="280px" />
              <div className="control-row control-row--stack">
                <div className="control-row">
                  <span aria-hidden="true">📡</span>
                  <select
                    className="select-input"
                    value={sendEndpoint}
                    onChange={(e) => setSendEndpoint(e.target.value)}
                  >
                    <option value="http://localhost:8080">Local refinery</option>
                    <option value="https://api.honeycomb.io">https://api.honeycomb.io</option>
                    <option value="https://api.eu1.honeycomb.io">https://api.eu1.honeycomb.io</option>
                  </select>
                  <input
                    type="password"
                    className="text-input"
                    placeholder="API Key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={handleManualSend}
                    disabled={sending || !resultJson.trim()}
                  >
                    Send
                  </button>
                  <label className="inline-label">
                    Auto
                    <select
                      className="select-input"
                      value={String(sendAuto)}
                      onChange={(e) => setSendAuto(e.target.value === 'true')}
                    >
                      <option value="true">on</option>
                      <option value="false">off</option>
                    </select>
                  </label>
                  {resultHistory.items.length > 0 && (
                    <label className="inline-label">
                      Results
                      <select
                        className="select-input"
                        value={resultHistory.selectedIndex}
                        onChange={(e) => handleResultHistoryChange(Number(e.target.value))}
                      >
                        {resultHistory.items.map((_, i) => (
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
              </div>
            </div>
          </div>
        </>
      )}
    </CollapsibleSection>
  )
}
