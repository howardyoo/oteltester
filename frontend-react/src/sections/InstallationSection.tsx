import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  fetchOtelcolVersion,
  fetchOtelcolVersions,
  fetchRefineryVersion,
  fetchRefineryVersions,
  installOtelcol,
  installRefinery,
} from '../api/client'
import { useApp } from '../context/AppContext'
import { CollapsibleSection } from '../components/CollapsibleSection'
import { useRegisterUiSync } from '../hooks/useRegisterUiSync'
import { useWebSocket } from '../hooks/useWebSocket'

function InstallPanel({
  title,
  description,
  versions,
  selectedVersion,
  onVersionChange,
  installStatus,
  installing,
  onInstall,
  onCancel,
  showCancel,
}: {
  title: string
  description: string
  versions: string[]
  selectedVersion: string
  onVersionChange: (version: string) => void
  installStatus: ReactNode
  installing: boolean
  onInstall: () => void
  onCancel: () => void
  showCancel: boolean
}) {
  return (
    <div className="install-panel">
      <h3 className="subsection-title">{title}</h3>
      <p className="muted">{description}</p>
      <div className="control-row">
        <select
          className="select-input"
          value={selectedVersion}
          onChange={(e) => onVersionChange(e.target.value)}
          disabled={installing}
        >
          {versions.map((version) => (
            <option key={version} value={version}>
              {version}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn--primary"
          onClick={onInstall}
          disabled={installing || versions.length === 0}
        >
          Install
        </button>
        {showCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
        <span className="install-status">{installStatus}</span>
      </div>
    </div>
  )
}

export function InstallationSection() {
  const { config, loading, refreshConfig } = useApp()
  const [otelcolVersions, setOtelcolVersions] = useState<string[]>([])
  const [refineryVersions, setRefineryVersions] = useState<string[]>([])
  const [otelcolVersion, setOtelcolVersion] = useState('')
  const [refineryVersion, setRefineryVersion] = useState('')
  const [otelcolStatus, setOtelcolStatus] = useState<ReactNode>('🔴 Uninstalled')
  const [refineryStatus, setRefineryStatus] = useState<ReactNode>('🔴 Uninstalled')
  const [otelcolInstalling, setOtelcolInstalling] = useState(false)
  const [refineryInstalling, setRefineryInstalling] = useState(false)

  useRegisterUiSync({
    refreshConfig: () => {
      refreshConfig().catch(console.error)
    },
  })

  const otelcolSetup = useWebSocket({
    hostName: config?.host_name,
    path: '/otelcol_setup',
    enabled: !!config,
    onMessage: (message) => {
      if (message === '{{cancelled}}') {
        setOtelcolInstalling(false)
        setOtelcolStatus('🔴 Cancelled')
        return
      }
      try {
        const json = JSON.parse(message) as { html?: string; status?: string }
        if (json.html) setOtelcolStatus(<span dangerouslySetInnerHTML={{ __html: json.html }} />)
        if (json.status === 'success') {
          setOtelcolInstalling(false)
          if (json.html) setOtelcolStatus(json.html.replace(/<[^>]+>/g, ''))
          refreshConfig()
        }
      } catch {
        /* ignore non-json messages */
      }
    },
  })

  const refinerySetup = useWebSocket({
    hostName: config?.host_name,
    path: '/refinery_setup',
    enabled: !!config,
    onMessage: (message) => {
      if (message === '{{cancelled}}') {
        setRefineryInstalling(false)
        setRefineryStatus('🔴 Cancelled')
        return
      }
      try {
        const json = JSON.parse(message) as { html?: string; status?: string }
        if (json.html) setRefineryStatus(<span dangerouslySetInnerHTML={{ __html: json.html }} />)
        if (json.status === 'success') {
          setRefineryInstalling(false)
          if (json.html) setRefineryStatus(json.html.replace(/<[^>]+>/g, ''))
          refreshConfig()
        }
      } catch {
        /* ignore */
      }
    },
  })

  useEffect(() => {
    fetchOtelcolVersions()
      .then((versions) => {
        const list = versions.map((v) => v.version)
        setOtelcolVersions(list)
        if (list.length > 0) setOtelcolVersion(list[0])
      })
      .catch(() => {})

    fetchRefineryVersions()
      .then((versions) => {
        const list = versions.map((v) => v.version)
        setRefineryVersions(list)
        if (list.length > 0) setRefineryVersion(list[0])
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (loading || !config) return

    if (config.collector_installed) {
      fetchOtelcolVersion()
        .then((data) => {
          if (data.result && data.version) {
            setOtelcolStatus(`🟢 Installed: ${String(data.version).trim()}`)
          } else {
            setOtelcolStatus(`🟢 Installed: ${config.collector_version}`)
          }
        })
        .catch(() => setOtelcolStatus(`🟢 Installed: ${config.collector_version}`))
    } else {
      setOtelcolStatus('🔴 Uninstalled')
    }

    if (config.refinery_installed) {
      fetchRefineryVersion()
        .then((data) => {
          if (data.result && data.version) {
            setRefineryStatus(`🟢 Installed: ${String(data.version).trim()}`)
          } else {
            setRefineryStatus(`🟢 Installed: ${config.refinery_version}`)
          }
        })
        .catch(() => setRefineryStatus(`🟢 Installed: ${config.refinery_version}`))
    } else {
      setRefineryStatus('🔴 Uninstalled')
    }
  }, [config, loading])

  const handleOtelcolInstall = useCallback(async () => {
    setOtelcolInstalling(true)
    try {
      const data = await installOtelcol(otelcolVersion)
      if (!data.started) {
        setOtelcolInstalling(false)
        setOtelcolStatus(`❌ ${data.message}`)
      } else {
        setOtelcolStatus('Installing...')
      }
    } catch (err) {
      setOtelcolInstalling(false)
      setOtelcolStatus(`❌ ${err instanceof Error ? err.message : 'Install failed'}`)
    }
  }, [otelcolVersion])

  const handleRefineryInstall = useCallback(async () => {
    setRefineryInstalling(true)
    try {
      const data = await installRefinery(refineryVersion)
      if (!data.started) {
        setRefineryInstalling(false)
        setRefineryStatus(`❌ ${data.message}`)
      } else {
        setRefineryStatus('Installing...')
      }
    } catch (err) {
      setRefineryInstalling(false)
      setRefineryStatus(`❌ ${err instanceof Error ? err.message : 'Install failed'}`)
    }
  }, [refineryVersion])

  return (
    <CollapsibleSection id="section-installation" title="🛠️ Installation">
      <div className="split-row">
        <InstallPanel
          title="Opentelemetry Collector Installation"
          description="Please select the version of the collector you want to install. All the versions are contrib versions."
          versions={otelcolVersions}
          selectedVersion={otelcolVersion}
          onVersionChange={setOtelcolVersion}
          installStatus={otelcolStatus}
          installing={otelcolInstalling}
          onInstall={handleOtelcolInstall}
          onCancel={() => otelcolSetup.send('{{cancel}}')}
          showCancel={otelcolInstalling}
        />
        <InstallPanel
          title="Refinery Installation"
          description="Please select the version of the refinery you want to install"
          versions={refineryVersions}
          selectedVersion={refineryVersion}
          onVersionChange={setRefineryVersion}
          installStatus={refineryStatus}
          installing={refineryInstalling}
          onInstall={handleRefineryInstall}
          onCancel={() => refinerySetup.send('{{cancel}}')}
          showCancel={refineryInstalling}
        />
      </div>
    </CollapsibleSection>
  )
}
