import { createRoot } from 'react-dom/client'
import '@/ui/shared/theme.css'
import { SidePanel } from './SidePanel'

createRoot(document.getElementById('root')!).render(<SidePanel />)
