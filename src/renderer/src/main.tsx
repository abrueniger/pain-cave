import { createRoot } from 'react-dom/client'
import './styles.css' // first, so screen styles can override the base classes
import { App } from './App'
import { api } from './api'

// Lets CSS make room for the window controls drawn over the top bar (see main/index.ts titleBarStyle)
document.documentElement.dataset.platform = api.platform

createRoot(document.getElementById('root')!).render(<App />)
