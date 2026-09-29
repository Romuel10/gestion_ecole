import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ConfirmProvider } from './components/common/ConfirmProvider'
import { AppErrorBoundary } from './components/common/AppErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
