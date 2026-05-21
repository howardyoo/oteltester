import { AppProvider } from './context/AppContext'
import { McpActivityProvider } from './context/McpActivityProvider'
import { UiSyncProvider } from './context/UiSyncContext'
import { ThemeProvider } from './theme/ThemeProvider'
import { Header } from './components/Header'
import { InstallationSection } from './sections/InstallationSection'
import { OtelCollectorSection } from './sections/OtelCollectorSection'
import { RefinerySection } from './sections/RefinerySection'
import { TelemetryTemplatesSection } from './sections/TelemetryTemplatesSection'
import { useApp } from './context/AppContext'
import './App.css'

function AppContent() {
  const { error } = useApp()

  return (
    <>
      <Header />
      <main className="app-content">
        <h1 className="page-title">🕸️ OpenTelemetry Collector and Refinery Tester ⚗️</h1>

        {error && (
          <div className="banner banner--error" role="alert">
            Failed to load configuration: {error}
          </div>
        )}

        <InstallationSection />
        <TelemetryTemplatesSection />
        <OtelCollectorSection />
        <RefinerySection />
      </main>
    </>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <UiSyncProvider>
          <McpActivityProvider>
            <AppContent />
          </McpActivityProvider>
        </UiSyncProvider>
      </AppProvider>
    </ThemeProvider>
  )
}
