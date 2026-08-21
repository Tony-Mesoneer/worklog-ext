import { createRoot } from 'react-dom/client'
import '@/ui/shared/theme.css'
import { ErrorBoundary } from '@/ui/shared/ErrorBoundary'
import { LocaleProvider } from '@/ui/shared/LocaleProvider'
import { Options } from './Options'

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <LocaleProvider>
      <Options />
    </LocaleProvider>
  </ErrorBoundary>,
)
