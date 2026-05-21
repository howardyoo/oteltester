import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import type { SendJsonResponse } from '../api/client'

export interface UiSyncHandlers {
  setOtelInput?: (json: string) => void
  appendOtelInput?: (json: string) => void
  setOtelcolConfig?: (yaml: string) => void
  setRefineryConfig?: (yaml: string) => void
  setRefineryRule?: (yaml: string) => void
  showOtelInputValidation?: (data: SendJsonResponse) => void
  refreshOtelcol?: () => void
  refreshRefinery?: () => void
  refreshConfig?: () => void
}

interface UiSyncContextValue {
  register: (handlers: UiSyncHandlers) => () => void
  invoke: <K extends keyof UiSyncHandlers>(
    key: K,
    ...args: Parameters<NonNullable<UiSyncHandlers[K]>>
  ) => void
}

const UiSyncContext = createContext<UiSyncContextValue | null>(null)

export function UiSyncProvider({ children }: { children: ReactNode }) {
  const handlersRef = useRef<UiSyncHandlers[]>([])

  const register = useCallback((handlers: UiSyncHandlers) => {
    handlersRef.current.push(handlers)
    return () => {
      handlersRef.current = handlersRef.current.filter((h) => h !== handlers)
    }
  }, [])

  const invoke = useCallback(
    <K extends keyof UiSyncHandlers>(
      key: K,
      ...args: Parameters<NonNullable<UiSyncHandlers[K]>>
    ) => {
      for (const handlers of handlersRef.current) {
        const fn = handlers[key] as UiSyncHandlers[K]
        if (fn) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(fn as (...a: unknown[]) => void)(...args)
        }
      }
    },
    [],
  )

  const value = useMemo(() => ({ register, invoke }), [register, invoke])

  return <UiSyncContext.Provider value={value}>{children}</UiSyncContext.Provider>
}

export function useUiSync() {
  const context = useContext(UiSyncContext)
  if (!context) {
    throw new Error('useUiSync must be used within UiSyncProvider')
  }
  return context
}

export function useRegisterUiSync(handlers: UiSyncHandlers) {
  const { register } = useUiSync()
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useMemo(() => {
    return register({
      setOtelInput: (...args) => handlersRef.current.setOtelInput?.(...args),
      appendOtelInput: (...args) => handlersRef.current.appendOtelInput?.(...args),
      setOtelcolConfig: (...args) => handlersRef.current.setOtelcolConfig?.(...args),
      setRefineryConfig: (...args) => handlersRef.current.setRefineryConfig?.(...args),
      setRefineryRule: (...args) => handlersRef.current.setRefineryRule?.(...args),
      showOtelInputValidation: (...args) => handlersRef.current.showOtelInputValidation?.(...args),
      refreshOtelcol: () => handlersRef.current.refreshOtelcol?.(),
      refreshRefinery: () => handlersRef.current.refreshRefinery?.(),
      refreshConfig: () => handlersRef.current.refreshConfig?.(),
    })
  }, [register])
}
