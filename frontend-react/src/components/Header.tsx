import { ThemeToggle } from './ThemeToggle'
import './Header.css'

const NAV_ITEMS = [
  { id: 'home', label: 'Home' },
  { id: 'section-templates', label: 'Telemetry Templates' },
  { id: 'section-collector', label: 'OTEL Collector' },
  { id: 'section-refinery', label: 'Refinery' },
] as const

function scrollTo(id: string) {
  if (id === 'home') {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function Header() {
  return (
    <header className="app-header">
      <img
        src="/images/honeycomb-512x512-2.png"
        alt="Honeycomb"
        className="app-header__logo"
      />
      <nav className="app-header__nav" aria-label="Main">
        {NAV_ITEMS.map((item, index) => (
          <span key={item.id} className="app-header__nav-item">
            {index > 0 && <span className="app-header__sep">|</span>}
            <button type="button" className="app-header__link" onClick={() => scrollTo(item.id)}>
              {item.label}
            </button>
          </span>
        ))}
      </nav>
      <ThemeToggle />
    </header>
  )
}
