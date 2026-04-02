import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { WalletProvider } from './contexts/WalletContext'
import { DataProvider } from './contexts/DataContext'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <WalletProvider>
        <DataProvider>
          <App />
        </DataProvider>
      </WalletProvider>
    </BrowserRouter>
  </React.StrictMode>
)
