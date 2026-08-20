// src/ui/dashboard/main.tsx
import { createRoot } from 'react-dom/client'
import '@/ui/shared/theme.css'
import { Dashboard } from './Dashboard'

createRoot(document.getElementById('root')!).render(<Dashboard />)
