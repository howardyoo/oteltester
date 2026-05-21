import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchAiAssistantStatus, wsBase, type SendJsonResponse } from '../api/client'
import { useApp } from '../context/AppContext'
import type { ChatMessage } from '../lib/aiPrompts'
import './AiAssistant.css'

type MessageRole = 'user' | 'assistant' | 'error'

interface ChatLine {
  id: string
  role: MessageRole
  content: string
}

interface AiAssistantProps {
  idPrefix: string
  systemPrompt: ChatMessage[]
  extraPrompt?: () => ChatMessage[]
  onComplete?: (assistantText: string) => void
  compact?: boolean
}

export function AiAssistant({
  idPrefix,
  systemPrompt,
  extraPrompt,
  onComplete,
  compact = false,
}: AiAssistantProps) {
  const { config } = useApp()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatLine[]>([])
  const [streaming, setStreaming] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const streamBufferRef = useRef('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const extraPromptRef = useRef(extraPrompt)
  extraPromptRef.current = extraPrompt

  useEffect(() => {
    fetchAiAssistantStatus()
      .then((data) => setEnabled(data.result))
      .catch(() => setEnabled(false))
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  useEffect(() => {
    if (!enabled || !config?.host_name) return

    let cancelled = false
    let reconnectTimer: ReturnType<typeof setTimeout>

    const connect = () => {
      if (cancelled) return
      const ws = new WebSocket(`${wsBase(config.host_name)}/ai_assistant?id_prefix=${idPrefix}`)
      wsRef.current = ws

      ws.onmessage = (event) => {
        const message = String(event.data)
        if (message === '{{pong}}') return

        if (message === '{{start}}') {
          streamBufferRef.current = ''
          setStreaming(true)
          setMessages((prev) => [
            ...prev,
            { id: `${Date.now()}-assistant`, role: 'assistant', content: '' },
          ])
          return
        }

        if (message === '{{errorstart}}') {
          setStreaming(true)
          setMessages((prev) => [
            ...prev,
            { id: `${Date.now()}-error`, role: 'error', content: '⚠️ ' },
          ])
          return
        }

        if (message === '{{errorend}}') {
          setStreaming(false)
          return
        }

        if (message === '{{end}}') {
          setStreaming(false)
          const text = streamBufferRef.current
          onCompleteRef.current?.(text)
          return
        }

        streamBufferRef.current += message
        setMessages((prev) => {
          if (prev.length === 0) return prev
          const next = [...prev]
          const last = next[next.length - 1]
          next[next.length - 1] = { ...last, content: last.content + message }
          return next
        })
      }

      ws.onclose = () => {
        wsRef.current = null
        if (!cancelled) reconnectTimer = setTimeout(connect, 1000)
      }
    }

    connect()
    const pingTimer = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send('ping')
      }
    }, 5000)

    return () => {
      cancelled = true
      clearTimeout(reconnectTimer)
      clearInterval(pingTimer)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [enabled, config?.host_name, idPrefix])

  const sendMessage = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed) return

    setMessages((prev) => [...prev, { id: `${Date.now()}-user`, role: 'user', content: trimmed }])
    setInput('')

    const prompt: ChatMessage[] = [...systemPrompt]
    if (extraPromptRef.current) {
      prompt.push(...extraPromptRef.current())
    }
    for (const line of messages) {
      if (line.role === 'user' || line.role === 'assistant') {
        prompt.push({ role: line.role, content: line.content })
      }
    }
    prompt.push({ role: 'user', content: trimmed })

    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(prompt))
    }
  }, [input, messages, systemPrompt])

  if (enabled === null) {
    return <div className="ai-assistant ai-assistant--loading muted">Checking AI assistant...</div>
  }

  if (!enabled) {
    return null
  }

  return (
    <div className={`ai-assistant${compact ? ' ai-assistant--compact' : ''}`}>
      <div className="ai-assistant__header">
        <h3 className="subsection-title">🧠 AI Assistant</h3>
        <button type="button" className="btn btn--small" onClick={() => setMessages([])}>
          Clear chat
        </button>
      </div>
      <div className="ai-assistant__input-row">
        <textarea
          className="ai-assistant__input"
          rows={1}
          placeholder="Type your instructions here..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              sendMessage()
            }
          }}
        />
        <button type="button" className="btn btn--primary" onClick={sendMessage} disabled={streaming}>
          Enter
        </button>
      </div>
      <div className="ai-assistant__messages">
        {messages.map((line) => (
          <div
            key={line.id}
            className={`chat-message chat-message-${line.role === 'error' ? 'error' : line.role}`}
          >
            {line.role === 'assistant' ? <pre>{line.content}</pre> : line.content}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}

export type { SendJsonResponse }
