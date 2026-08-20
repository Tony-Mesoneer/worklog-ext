import { createRoot } from 'react-dom/client'
import '@/ui/shared/theme.css'
import { ErrorBoundary } from '@/ui/shared/ErrorBoundary'
import { SidePanel } from './SidePanel'

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <SidePanel />
  </ErrorBoundary>,
)
