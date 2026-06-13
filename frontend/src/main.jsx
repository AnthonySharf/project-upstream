import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import Landing from './Landing.jsx'
import About from './About.jsx'
import Methodology from './Methodology.jsx'
import ComingSoon from './ComingSoon.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/map" element={<App />} />
        <Route path="/about" element={<About />} />
        <Route path="/methodology" element={<Methodology />} />
        <Route path="/coming-soon" element={<ComingSoon />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
