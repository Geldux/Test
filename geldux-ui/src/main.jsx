import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ToastProvider } from './contexts/ToastContext'
import { WalletProvider } from './contexts/WalletContext'
import { DataProvider } from './contexts/DataContext'
import Toaster from './components/ui/Toast'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <WalletProvider>
          <DataProvider>
            <App />
            <Toaster />
          </DataProvider>
        </WalletProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
)
