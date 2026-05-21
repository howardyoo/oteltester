import { useCallback, useState } from 'react'
import { useApp } from './AppContext'
import { useUiSync } from './UiSyncContext'
import { useWebSocket } from '../hooks/useWebSocket'
import type { SendJsonResponse } from '../api/client'
import './McpActivity.css'

interface McpActivity {
  action: string
  data?: Record<string, unknown>
}

interface Notification {
  id: string
  title: string
  message: string
}

function activityTitle(action: string): string {
  const titles: Record<string, string> = {
    config_saved: 'Configuration Updated',
    yaml_saved: 'Config Updated',
    otel_data_submitting: 'OTEL Data Submission',
    otel_data_submitted: 'OTEL Data Submitted',
    saved_json_updated: 'Saved JSON Updated',
    process_started: 'Process Started',
    process_stopped: 'Process Stopped',
    process_refreshed: 'Config Reloaded',
    output_forwarding: 'Forwarding Output',
    output_forwarded: 'Output Forwarded',
    output_buffer_cleared: 'Buffer Cleared',
    console_buffer_cleared: 'Console Cleared',
    otelcol_installed: 'OTEL Collector Installed',
    refinery_installed: 'Refinery Installed',
  }
  return titles[action] ?? 'MCP Activity'
}

export function McpActivityProvider({ children }: { children: React.ReactNode }) {
  const { config, refreshConfig } = useApp()
  const { invoke } = useUiSync()
  const [notifications, setNotifications] = useState<Notification[]>([])

  const pushNotification = useCallback((title: string, message: string) => {
    const id = `${Date.now()}-${Math.random()}`
    setNotifications((prev) => [...prev, { id, title, message }])
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    }, 5000)
  }, [])

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const handleActivity = useCallback(
    (activity: McpActivity) => {
      if (!activity?.action) return
      const data = activity.data ?? {}

      switch (activity.action) {
        case 'config_saved':
          pushNotification(activityTitle(activity.action), 'Main configuration was updated via MCP agent')
          invoke('refreshConfig')
          refreshConfig()
          break

        case 'yaml_saved': {
          const path = String(data.path ?? '')
          const content = String(data.content ?? '')
          if (path.includes('otelcol') && content) {
            invoke('setOtelcolConfig', content)
            pushNotification('OTEL Collector Config', 'Configuration updated via MCP agent')
          } else if (path.includes('refinery-config') && content) {
            invoke('setRefineryConfig', content)
            pushNotification('Refinery Config', 'Configuration updated via MCP agent')
          } else if (path.includes('refinery-rule') && content) {
            invoke('setRefineryRule', content)
            pushNotification('Refinery Rules', 'Rules updated via MCP agent')
          }
          break
        }

        case 'otel_data_submitting': {
          const json = data.json
          if (json) {
            const jsonStr = JSON.stringify(json, null, 2)
            invoke('setOtelInput', jsonStr)
            invoke('appendOtelInput', jsonStr)
            pushNotification(
              activityTitle(activity.action),
              `Data submitted via MCP agent to: ${String(data.url ?? 'endpoint')}`,
            )
          }
          break
        }

        case 'otel_data_submitted':
          if (data.result) {
            invoke('showOtelInputValidation', {
              message: 'MCP submission result',
              result: data.result as unknown[],
            })
          }
          break

        case 'saved_json_updated':
          pushNotification(activityTitle(activity.action), `'${String(data.name ?? '')}' updated via MCP agent`)
          break

        case 'process_started':
          pushNotification(
            activityTitle(activity.action),
            `${String(data.type ?? 'process')} started via MCP agent (PID: ${String(data.pid ?? '')})`,
          )
          break

        case 'process_stopped':
          pushNotification(activityTitle(activity.action), `${String(data.type ?? 'process')} stopped via MCP agent`)
          break

        case 'process_refreshed':
          pushNotification(activityTitle(activity.action), `${String(data.type ?? 'process')} configuration reloaded via MCP agent`)
          break

        case 'output_forwarding':
          pushNotification(
            activityTitle(activity.action),
            `Forwarding ${String(data.type ?? 'data')} from ${String(data.source ?? '')} to ${String(data.target ?? '')}`,
          )
          break

        case 'output_forwarded': {
          const result = data.result as { sent?: boolean; message?: string } | undefined
          pushNotification(
            result?.sent ? 'Output Forwarded' : 'Forward Failed',
            result?.message ?? (result?.sent ? 'Data forwarded successfully' : 'Failed to forward data'),
          )
          break
        }

        case 'output_buffer_cleared':
          pushNotification(activityTitle(activity.action), `${String(data.source ?? '')} output buffer cleared via MCP`)
          break

        case 'console_buffer_cleared':
          pushNotification(activityTitle(activity.action), `${String(data.source ?? '')} console buffer cleared via MCP`)
          break

        case 'otelcol_installed':
          pushNotification(
            activityTitle(activity.action),
            String(data.message ?? 'OTEL Collector installed via MCP'),
          )
          invoke('refreshOtelcol')
          refreshConfig()
          break

        case 'refinery_installed':
          pushNotification(
            activityTitle(activity.action),
            String(data.message ?? 'Refinery installed via MCP'),
          )
          invoke('refreshRefinery')
          refreshConfig()
          break

        default:
          break
      }
    },
    [invoke, pushNotification, refreshConfig],
  )

  useWebSocket({
    hostName: config?.host_name,
    path: '/mcp_activity',
    enabled: !!config,
    onMessage: (message) => {
      try {
        handleActivity(JSON.parse(message) as McpActivity)
      } catch {
        /* ignore parse errors */
      }
    },
  })

  return (
    <>
      {children}
      <div className="mcp-notifications" aria-live="polite">
        {notifications.map((n, index) => (
          <div key={n.id} className="mcp-notification show" style={{ top: `${60 + index * 80}px` }}>
            <div className="mcp-notification-header">
              <span className="mcp-notification-icon">🤖</span>
              <span className="mcp-notification-title">{n.title}</span>
              <button
                type="button"
                className="mcp-notification-close"
                onClick={() => dismiss(n.id)}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
            <div className="mcp-notification-body">{n.message}</div>
          </div>
        ))}
      </div>
    </>
  )
}

export type { SendJsonResponse }
