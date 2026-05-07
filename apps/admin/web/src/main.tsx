import '@unocss/reset/tailwind-compat.css'
import 'virtual:uno.css'
import '@/assets/styles/global.css'

import { createRoot } from 'react-dom/client'
import App from './App'
import { fetchConfig } from './store/config'

fetchConfig().then(() => {
  createRoot(document.getElementById('app')!).render(<App />)
})
