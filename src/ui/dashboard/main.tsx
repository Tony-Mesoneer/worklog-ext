// src/ui/dashboard/main.tsx
import { createRoot } from 'react-dom/client'
import '@/ui/shared/theme.css'
import { ErrorBoundary } from '@/ui/shared/ErrorBoundary'
import { LocaleProvider } from '@/ui/shared/LocaleProvider'
import { Dashboard } from './Dashboard'

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <LocaleProvider>
      <Dashboard />
    </LocaleProvider>
  </ErrorBoundary>,
)
