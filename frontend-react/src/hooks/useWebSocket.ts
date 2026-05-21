import { useCallback, useEffect, useRef, useState } from 'react'
import { wsBase } from '../api/client'

interface UseWebSocketOptions {
  hostName: string | undefined
  path: string
  enabled?: boolean
  mode?: 'append' | 'replace'
  onMessage?: (data: string) => void
}

export function useWebSocket({
  hostName,
  path,
  enabled = true,
  mode = 'append',
  onMessage,
}: UseWebSocketOptions) {
  const [text, setText] = useState('')
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const clear = useCallback(() => setText(''), [])

  const send = useCallback((message: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(message)
    }
  }, [])

  useEffect(() => {
    if (!enabled || !hostName) return

    let cancelled = false
    let reconnectTimer: ReturnType<typeof setTimeout>
    let pingTimer: ReturnType<typeof setInterval>

    const connect = () => {
      if (cancelled) return

      const url = `${wsBase(hostName)}${path}`
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onmessage = (event) => {
        const message = String(event.data)
        if (message === '{{pong}}') return

        if (onMessageRef.current) {
          onMessageRef.current(message)
          return
        }

        setText((prev) => (mode === 'replace' ? message : prev + message))
      }

      ws.onclose = () => {
        wsRef.current = null
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, 1000)
        }
      }

      ws.onopen = () => {
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping')
          }
        }, 5000)
      }
    }

    connect()

    return () => {
      cancelled = true
      clearTimeout(reconnectTimer)
      clearInterval(pingTimer)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [hostName, path, enabled, mode])

  return { text, setText, clear, send }
}
