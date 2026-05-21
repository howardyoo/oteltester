import { useEffect, useRef } from 'react'
import { useUiSync, type UiSyncHandlers } from '../context/UiSyncContext'

export function useRegisterUiSync(handlers: UiSyncHandlers) {
  const { register } = useUiSync()
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    return register({
      setOtelInput: (json: string) => handlersRef.current.setOtelInput?.(json),
      appendOtelInput: (json: string) => handlersRef.current.appendOtelInput?.(json),
      setOtelcolConfig: (yaml: string) => handlersRef.current.setOtelcolConfig?.(yaml),
      setRefineryConfig: (yaml: string) => handlersRef.current.setRefineryConfig?.(yaml),
      setRefineryRule: (yaml: string) => handlersRef.current.setRefineryRule?.(yaml),
      showOtelInputValidation: (data) => handlersRef.current.showOtelInputValidation?.(data),
      refreshOtelcol: () => handlersRef.current.refreshOtelcol?.(),
      refreshRefinery: () => handlersRef.current.refreshRefinery?.(),
      refreshConfig: () => handlersRef.current.refreshConfig?.(),
    })
  }, [register])
}
