import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { yaml } from '@codemirror/lang-yaml'
import { oneDark } from '@codemirror/theme-one-dark'
import { useTheme } from '../theme/ThemeProvider'
import './CodeEditor.css'

type EditorLanguage = 'json' | 'yaml'

interface CodeEditorProps {
  value: string
  onChange?: (value: string) => void
  language?: EditorLanguage
  readOnly?: boolean
  minHeight?: string
  className?: string
}

export function CodeEditor({
  value,
  onChange,
  language = 'yaml',
  readOnly = false,
  minHeight = '280px',
  className,
}: CodeEditorProps) {
  const { resolvedTheme } = useTheme()
  const extensions = [language === 'json' ? json() : yaml()]

  return (
    <div className={`code-editor${className ? ` ${className}` : ''}`} style={{ minHeight }}>
      <CodeMirror
        value={value}
        height={minHeight}
        extensions={extensions}
        theme={resolvedTheme === 'dark' ? oneDark : 'light'}
        editable={!readOnly}
        onChange={(next) => onChange?.(next)}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
        }}
      />
    </div>
  )
}
