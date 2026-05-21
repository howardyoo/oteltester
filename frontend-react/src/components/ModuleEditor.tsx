import { useEffect, useState } from 'react'
import { fetchMarkdown, fetchOtelcolModules, type OtelModules } from '../api/client'
import { AiAssistant } from './AiAssistant'
import { moduleSystemPrompt, type ChatMessage } from '../lib/aiPrompts'
import './ModuleEditor.css'

export type ModuleKind = 'receivers' | 'processors' | 'exporters' | 'connectors' | 'extensions'

const MODULE_META: Record<
  ModuleKind,
  { label: string; icon: string; apiKey: string; githubFolder: string; aiPrefix: string }
> = {
  receivers: { label: 'Receivers', icon: '🤲🏻', apiKey: 'receiver', githubFolder: 'receiver', aiPrefix: 'receiver' },
  processors: { label: 'Processors', icon: '⚙️', apiKey: 'processor', githubFolder: 'processor', aiPrefix: 'processor' },
  exporters: { label: 'Exporters', icon: '📤', apiKey: 'exporter', githubFolder: 'exporter', aiPrefix: 'exporter' },
  connectors: { label: 'Connectors', icon: '🔗', apiKey: 'connector', githubFolder: 'connector', aiPrefix: 'connector' },
  extensions: { label: 'Extensions', icon: '🧩', apiKey: 'extension', githubFolder: 'extension', aiPrefix: 'extension' },
}

interface ModuleEditorPanelProps {
  kind: ModuleKind
  collectorVersion: string
  configYaml: string
}

export function ModuleEditorPanel({ kind, collectorVersion, configYaml }: ModuleEditorPanelProps) {
  const meta = MODULE_META[kind]
  const [modules, setModules] = useState<OtelModules | null>(null)
  const [selectedModule, setSelectedModule] = useState<string | null>(null)
  const [moduleDoc, setModuleDoc] = useState('')
  const [moduleDocMarkdown, setModuleDocMarkdown] = useState('')

  useEffect(() => {
    fetchOtelcolModules(collectorVersion !== '0.0.0' ? collectorVersion : undefined)
      .then(setModules)
      .catch(() => setModules(null))
  }, [collectorVersion])

  const loadModuleDoc = async (name: string) => {
    setSelectedModule(name)
    const version =
      collectorVersion && collectorVersion !== '0.0.0' ? `tags/v${collectorVersion}` : 'heads/main'
    const url = `https://raw.githubusercontent.com/open-telemetry/opentelemetry-collector-contrib/refs/${version}/${meta.githubFolder}/${name}/README.md`
    try {
      const [html, markdown] = await Promise.all([
        fetchMarkdown(url, true),
        fetchMarkdown(url, false),
      ])
      setModuleDoc(html)
      setModuleDocMarkdown(markdown)
    } catch {
      setModuleDoc('<p>Failed to load module documentation.</p>')
      setModuleDocMarkdown('')
    }
  }

  const moduleList = modules?.[meta.apiKey] ?? []

  const extraPrompt = (): ChatMessage[] => {
    const prompt: ChatMessage[] = []
    if (configYaml) {
      prompt.push({
        role: 'system',
        content: `The following is the current YAML configuration for the OpenTelemetry Collector:\n\`\`\`yaml\n${configYaml}\n\`\`\``,
      })
    }
    if (moduleDocMarkdown) {
      prompt.push({
        role: 'system',
        content: `You are to use the following ${meta.label.toLowerCase()} documentation to help generate the next configuration:\n\`\`\`markdown\n${moduleDocMarkdown}\n\`\`\``,
      })
    }
    return prompt
  }

  return (
    <div className="module-editor edit-section">
      <div className="module-editor__grid">
        <div>
          <h3 className="subsection-title">
            {meta.icon} {meta.label}
          </h3>
          <div className="module-editor__list button-list">
            {moduleList.map((name) => (
              <button
                key={name}
                type="button"
                className={`pill-btn${selectedModule === name ? ' pill-btn--active' : ''}`}
                onClick={() => loadModuleDoc(name)}
              >
                {name}
              </button>
            ))}
            {moduleList.length === 0 && <p className="muted">No modules loaded.</p>}
          </div>
        </div>
        <div className="info-outer-section">
          <div
            className="info-section"
            dangerouslySetInnerHTML={{ __html: moduleDoc || '<p>Select a module to view documentation.</p>' }}
          />
        </div>
        <AiAssistant
          idPrefix={meta.aiPrefix}
          systemPrompt={moduleSystemPrompt(meta.label.toLowerCase())}
          extraPrompt={extraPrompt}
          compact
        />
      </div>
    </div>
  )
}

interface ModuleEditorsProps {
  collectorVersion: string
  configYaml: string
}

export function ModuleEditors({ collectorVersion, configYaml }: ModuleEditorsProps) {
  const [active, setActive] = useState<ModuleKind | null>(null)

  const toggle = (kind: ModuleKind) => {
    setActive((prev) => (prev === kind ? null : kind))
  }

  return (
    <div className="module-editors">
      <div className="control-row control-row--wrap">
        {(Object.keys(MODULE_META) as ModuleKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            className={`btn btn--outline${active === kind ? ' btn--active' : ''}`}
            onClick={() => toggle(kind)}
          >
            {active === kind ? '▾' : '▸'} {MODULE_META[kind].label}
          </button>
        ))}
      </div>
      {active && (
        <ModuleEditorPanel
          kind={active}
          collectorVersion={collectorVersion}
          configYaml={configYaml}
        />
      )}
    </div>
  )
}
