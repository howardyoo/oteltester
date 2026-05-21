import { useTheme, type ThemeMode } from '../theme/ThemeProvider'
import './ThemeToggle.css'

const MODES: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'auto', label: 'Auto' },
]

export function ThemeToggle() {
  const { mode, setMode } = useTheme()

  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      {MODES.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          className={`theme-toggle__btn${mode === value ? ' theme-toggle__btn--active' : ''}`}
          onClick={() => setMode(value)}
          aria-pressed={mode === value}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
