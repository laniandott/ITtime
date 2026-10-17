import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// 先应用主题，避免 WebView 启动时短暂显示错误的白色页面。
// Aurora Glass 目前只设计了深空形态，默认走暗色；亮色适配后再恢复 matchMedia 判断。
const prefersDark = true
document.documentElement.classList.toggle('dark', prefersDark)
document.documentElement.style.colorScheme = prefersDark ? 'dark' : 'light'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
