import { useEffect, useState } from 'react'
import yaml from 'js-yaml'
import { fetchYaml, saveYaml, startRefinery, stopProcess } from '../api/client'
import { useApp } from '../context/AppContext'
import { AiAssistant } from '../components/AiAssistant'
import { CollapsibleSection } from '../components/CollapsibleSection'
import { CodeEditor } from '../components/CodeEditor'
import { useRegisterUiSync } from '../hooks/useRegisterUiSync'
import { useHistoryList } from '../hooks/useHistoryList'
import { useWebSocket } from '../hooks/useWebSocket'
import { extractCodeBlock, REFINERY_AI_SYSTEM_PROMPT, type ChatMessage } from '../lib/aiPrompts'

function statusIcon(ok: boolean | undefined) {
  return ok ? '✅' : '❌'
}

export function RefinerySection() {
  const { config, loading, refineryProcess, refreshConfig } = useApp()
  const refinery = config?.refinery

  const [configYaml, setConfigYaml] = useState('')
  const [ruleYaml, setRuleYaml] = useState('')
  const [savedConfig, setSavedConfig] = useState('')
  const [savedRule, setSavedRule] = useState('')
  const [configDirty, setConfigDirty] = useState(false)
  const [actionPending, setActionPending] = useState(false)
  const [aiSystemPrompt, setAiSystemPrompt] = useState<ChatMessage[]>(REFINERY_AI_SYSTEM_PROMPT)

  const configHistory = useHistoryList<string>()
  const ruleHistory = useHistoryList<string>()

  const consoleWs = useWebSocket({
    hostName: config?.host_name,
    path: '/refinery_stdout',
    enabled: !!config,
  })

  const resultWs = useWebSocket({
    hostName: config?.host_name,
    path: '/refinery_out',
    enabled: !!config,
    mode: 'replace',
  })

  useRegisterUiSync({
    setRefineryConfig: (yamlText: string) => {
      setConfigYaml(yamlText)
      setConfigDirty(yamlText !== savedConfig || ruleYaml !== savedRule)
      configHistory.append(yamlText)
    },
    setRefineryRule: (yamlText: string) => {
      setRuleYaml(yamlText)
      setConfigDirty(configYaml !== savedConfig || yamlText !== savedRule)
      ruleHistory.append(yamlText)
    },
    refreshRefinery: () => {
      refreshConfig().catch(console.error)
    },
  })

  useEffect(() => {
    Promise.all([
      fetchYaml('./examples/refinery-rule.yml').catch(() => ''),
      fetchYaml('./examples/refinery-config.yml').catch(() => ''),
    ]).then(([ruleExample, configExample]) => {
      const prompt = [...REFINERY_AI_SYSTEM_PROMPT]
      if (ruleExample) {
        prompt.push({
          role: 'system',
          content: `When generating rule yaml, start with rule version line (e.g. RulesVersion: 2). Example:\n\`\`\`yaml\n${ruleExample}\n\`\`\``,
        })
      }
      if (configExample) {
        prompt.push({
          role: 'system',
          content: `When generating configuration yaml, start with General section. Example:\n\`\`\`yaml\n${configExample}\n\`\`\``,
        })
      }
      setAiSystemPrompt(prompt)
    })
  }, [])

  useEffect(() => {
    if (!refinery) return

    if (config?.refinery_config_exists) {
      fetchYaml(refinery.config_path)
        .then((yamlText) => {
          setConfigYaml(yamlText)
          setSavedConfig(yamlText)
          configHistory.setItems([yamlText])
          configHistory.select(0)
          setConfigDirty(false)
        })
        .catch(console.error)
    }

    if (config?.refinery_rule_exists) {
      fetchYaml(refinery.rule_path)
        .then((yamlText) => {
          setRuleYaml(yamlText)
          setSavedRule(yamlText)
          ruleHistory.setItems([yamlText])
          ruleHistory.select(0)
        })
        .catch(console.error)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config?.refinery_config_exists,
    config?.refinery_rule_exists,
    refinery?.config_path,
    refinery?.rule_path,
  ])

  const handleConfigChange = (value: string) => {
    setConfigYaml(value)
    setConfigDirty(value !== savedConfig || ruleYaml !== savedRule)
  }

  const handleRuleChange = (value: string) => {
    setRuleYaml(value)
    setConfigDirty(configYaml !== savedConfig || value !== savedRule)
  }

  const handleStart = async () => {
    setActionPending(true)
    try {
      const data = await startRefinery()
      if (!data.result) console.error(data.error ?? data.message)
    } finally {
      setActionPending(false)
    }
  }

  const handleStop = async () => {
    if (!refineryProcess.pid) return
    setActionPending(true)
    try {
      await stopProcess(refineryProcess.pid)
    } finally {
      setActionPending(false)
    }
  }

  const handleSave = async () => {
    if (!refinery) return
    setActionPending(true)
    try {
      await saveYaml(refinery.config_path, configYaml)
      await saveYaml(refinery.rule_path, ruleYaml)
      setSavedConfig(configYaml)
      setSavedRule(ruleYaml)
      setConfigDirty(false)
      if (configHistory.selectedItem !== configYaml) configHistory.append(configYaml)
      if (ruleHistory.selectedItem !== ruleYaml) ruleHistory.append(ruleYaml)
    } finally {
      setActionPending(false)
    }
  }

  const handleReset = async () => {
    if (!refinery) return
    setActionPending(true)
    try {
      const exampleConfig = await fetchYaml('./examples/refinery-config.yml')
      const exampleRule = await fetchYaml('./examples/refinery-rule.yml')
      await saveYaml(refinery.config_path, exampleConfig)
      await saveYaml(refinery.rule_path, exampleRule)
      setConfigYaml(exampleConfig)
      setRuleYaml(exampleRule)
      setSavedConfig(exampleConfig)
      setSavedRule(exampleRule)
      setConfigDirty(false)
      configHistory.append(exampleConfig)
      ruleHistory.append(exampleRule)
    } finally {
      setActionPending(false)
    }
  }

  const handleClearOutputs = () => {
    consoleWs.clear()
    resultWs.clear()
  }

  const aiExtraPrompt = () => {
    const prompt: ChatMessage[] = []
    if (ruleYaml.trim()) {
      prompt.push({
        role: 'system',
        content: `Current refinery rules YAML:\n\`\`\`yaml\n${ruleYaml}\n\`\`\``,
      })
    }
    if (configYaml.trim()) {
      prompt.push({
        role: 'system',
        content: `Current refinery configuration YAML:\n\`\`\`yaml\n${configYaml}\n\`\`\``,
      })
    }
    return prompt
  }

  const applyRefineryAiResult = (text: string) => {
    const block = extractCodeBlock(text)
    if (!block) return
    try {
      let yamlObj = yaml.load(block) as Record<string, unknown>
      if (yamlObj.rules) yamlObj = yamlObj.rules as Record<string, unknown>
      const yamlText = yaml.dump(yamlObj)
      if ('RulesVersion' in yamlObj) {
        handleRuleChange(yamlText)
      } else if ('General' in yamlObj) {
        handleConfigChange(yamlText)
      }
    } catch {
      /* ignore parse errors */
    }
  }

  return (
    <CollapsibleSection id="section-refinery" title="⚗️ Refinery">
      {loading && <p className="muted">Loading refinery status...</p>}

      {!loading && refinery && (
        <>
          <ul className="file-status-list">
            <li>
              {statusIcon(config?.refinery_installed)} bin: {refinery.bin_path}
            </li>
            <li>
              {statusIcon(config?.refinery_config_exists)} config: {refinery.config_path}
            </li>
            <li>
              {statusIcon(config?.refinery_rule_exists)} rule: {refinery.rule_path}
            </li>
          </ul>

          <div
            className={`status-badge ${refineryProcess.running ? 'status-badge--running' : 'status-badge--stopped'}`}
          >
            {refineryProcess.running ? (
              <>
                🟢 Running
                {refineryProcess.debugUrl && (
                  <>
                    {' '}
                    |{' '}
                    <a href={refineryProcess.debugUrl} target="_blank" rel="noopener noreferrer">
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
              disabled={!config?.refinery_installed || refineryProcess.running || actionPending}
            >
              ⏵ Start
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleStop}
              disabled={!refineryProcess.running || actionPending}
            >
              ⏹ Stop
            </button>
            <button type="button" className="btn" onClick={handleSave} disabled={!configDirty || actionPending}>
              💾 Save Config
            </button>
            <button type="button" className="btn" onClick={handleReset} disabled={actionPending}>
              Reset Config
            </button>
            <button type="button" className="btn" onClick={handleClearOutputs}>
              🧹 Clear Outputs
            </button>
          </div>

          <div className="triple-row triple-row--mt">
            <div className="panel">
              <div className="panel-header">
                <h4 className="panel-subtitle">
                  📏 {refinery.rule_path}
                  {ruleHistory.items.length > 0 && (
                    <>
                      <span className="panel-subtitle__meta">Version</span>
                      <select
                        className="select-input select-input--small"
                        value={ruleHistory.selectedIndex}
                        onChange={(e) => {
                          const idx = Number(e.target.value)
                          ruleHistory.select(idx)
                          const item = ruleHistory.items[idx]
                          if (item) handleRuleChange(item)
                        }}
                      >
                        {ruleHistory.items.map((_, i) => (
                          <option key={i} value={i}>
                            {i + 1}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </h4>
              </div>
              <CodeEditor value={ruleYaml} onChange={handleRuleChange} language="yaml" minHeight="320px" />
            </div>

            <AiAssistant
              idPrefix="refinery_ai_chat"
              systemPrompt={aiSystemPrompt}
              extraPrompt={aiExtraPrompt}
              onComplete={applyRefineryAiResult}
              compact
            />

            <div className="panel">
              <div className="panel-header">
                <h4 className="panel-subtitle">🖥️ Console Output</h4>
                <button type="button" className="btn btn--small" onClick={consoleWs.clear}>
                  Clear
                </button>
              </div>
              <CodeEditor value={consoleWs.text} language="yaml" readOnly minHeight="320px" />
            </div>
          </div>

          <div className="split-row split-row--mt">
            <div className="panel">
              <div className="panel-header">
                <h4 className="panel-subtitle">
                  ⚙️ {refinery.config_path}
                  {configHistory.items.length > 0 && (
                    <>
                      <span className="panel-subtitle__meta">Version</span>
                      <select
                        className="select-input select-input--small"
                        value={configHistory.selectedIndex}
                        onChange={(e) => {
                          const idx = Number(e.target.value)
                          configHistory.select(idx)
                          const item = configHistory.items[idx]
                          if (item) handleConfigChange(item)
                        }}
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

            <div className="panel">
              <div className="panel-header">
                <h4 className="panel-subtitle">📢 Refinery Result</h4>
                <button type="button" className="btn btn--small" onClick={resultWs.clear}>
                  Clear
                </button>
              </div>
              <CodeEditor value={resultWs.text} language="json" readOnly minHeight="320px" />
            </div>
          </div>
        </>
      )}
    </CollapsibleSection>
  )
}
