import React from 'react'
import ReactDOM from 'react-dom/client'
import MobileApp from './MobileApp'
import './index.css'
import './components/components.css'

// CRITICAL ERROR HANDLER
window.onerror = function (message, source, lineno, colno, error) {
    document.body.innerHTML = `
    <div style="color: red; padding: 20px; font-family: sans-serif;">
      <h1>CRITICAL ERROR</h1>
      <p><b>Msg:</b> ${message}</p>
      <p><b>Src:</b> ${source}:${lineno}</p>
      <pre>${error?.stack || ''}</pre>
    </div>
  `;
}

try {
    ReactDOM.createRoot(document.getElementById('root')!).render(
        <React.StrictMode>
            <MobileApp />
        </React.StrictMode>,
    )
} catch (e: any) {
    document.body.innerHTML = "<h1>Render Error</h1><pre>" + e.message + "</pre>"
}
