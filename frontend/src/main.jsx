import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { SocketProvider } from './socket.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SocketProvider>
      <App />
    </SocketProvider>
  </StrictMode>,
)
