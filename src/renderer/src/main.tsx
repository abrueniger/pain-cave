import { createRoot } from 'react-dom/client'
import './styles.css' // first, so screen styles can override the base classes
import { App } from './App'

createRoot(document.getElementById('root')!).render(<App />)
