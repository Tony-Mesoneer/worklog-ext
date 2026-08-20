import { createRoot } from 'react-dom/client'
import '@/ui/shared/theme.css'
import { ErrorBoundary } from '@/ui/shared/ErrorBoundary'
import { Options } from './Options'

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <Options />
  </ErrorBoundary>,
)
