import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { daftarServiceWorker } from './pwa'

createRoot(document.getElementById('root')!).render(<App />)
daftarServiceWorker()
