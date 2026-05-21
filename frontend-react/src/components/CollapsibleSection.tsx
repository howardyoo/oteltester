import { useState, type ReactNode } from 'react'
import './CollapsibleSection.css'

interface CollapsibleSectionProps {
  id: string
  title: string
  defaultExpanded?: boolean
  children: ReactNode
}

export function CollapsibleSection({
  id,
  title,
  defaultExpanded = true,
  children,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <section id={id} className="collapsible-section">
      <div className="collapsible-section__shell">
        <button
          type="button"
          className="collapsible-section__summary"
          aria-expanded={expanded}
          aria-controls={`${id}-panel`}
          onClick={() => setExpanded((prev) => !prev)}
        >
          <span
            className={`collapsible-section__chevron${expanded ? ' collapsible-section__chevron--open' : ''}`}
            aria-hidden="true"
          />
          <span className="collapsible-section__title">{title}</span>
        </button>
        {expanded && (
          <div id={`${id}-panel`} className="collapsible-section__body">
            {children}
          </div>
        )}
      </div>
    </section>
  )
}
