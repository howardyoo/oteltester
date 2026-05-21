import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  fetchConfig,
  fetchPids,
  type AppConfig,
} from '../api/client'

export interface ProcessState {
  running: boolean
  pid: string | null
  debugUrl: string | null
}

interface AppContextValue {
  config: AppConfig | null
  loading: boolean
  error: string | null
  refreshConfig: () => Promise<AppConfig>
  otelcolProcess: ProcessState
  refineryProcess: ProcessState
}

const defaultProcess: ProcessState = {
  running: false,
  pid: null,
  debugUrl: null,
}

const AppContext = createContext<AppContextValue | null>(null)

const STATUS_REFRESH_INTERVAL = 500

function detectProcesses(config: AppConfig, pidData: string[][]) {
  let otelcol: ProcessState = { ...defaultProcess }
  let refinery: ProcessState = { ...defaultProcess }

  for (const line of pidData) {
    const pid = line[1]
    const command = line[7] ?? ''
    const cmdConfig = line[8] ?? ''
    const commandName = command.split('/').pop() ?? ''

    if (
      commandName.includes('otelcol') &&
      cmdConfig.includes(config.otel_collector.config_path)
    ) {
      otelcol = {
        running: true,
        pid,
        debugUrl: 'http://localhost:1777/debug/pprof',
      }
    } else if (
      commandName.includes('refinery') &&
      cmdConfig.includes(config.refinery.config_path)
    ) {
      refinery = {
        running: true,
        pid,
        debugUrl: 'http://localhost:6060',
      }
    }
  }

  return { otelcol, refinery }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [otelcolProcess, setOtelcolProcess] = useState<ProcessState>(defaultProcess)
  const [refineryProcess, setRefineryProcess] = useState<ProcessState>(defaultProcess)

  const refreshConfig = useCallback(async () => {
    const data = await fetchConfig()
    setConfig(data)
    setError(null)
    return data
  }, [])

  useEffect(() => {
    refreshConfig()
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [refreshConfig])

  useEffect(() => {
    if (!config) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    const poll = async () => {
      try {
        const pidData = await fetchPids()
        if (cancelled) return
        const { otelcol, refinery } = detectProcesses(config, pidData)
        setOtelcolProcess(otelcol)
        setRefineryProcess(refinery)
      } catch {
        /* ignore transient poll errors */
      }
      if (!cancelled) {
        timer = setTimeout(poll, STATUS_REFRESH_INTERVAL)
      }
    }

    poll()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [config])

  const value = useMemo(
    () => ({
      config,
      loading,
      error,
      refreshConfig,
      otelcolProcess,
      refineryProcess,
    }),
    [config, loading, error, refreshConfig, otelcolProcess, refineryProcess],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within AppProvider')
  }
  return context
}
