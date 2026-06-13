import { Link, useLocation } from 'react-router-dom'
import upstreamLogo from './assets/upstream-removebg-preview.png'

const NAV_ITEMS = [
  { label: 'About', path: '/about' },
  { label: 'Methodology', path: '/methodology' },
  { label: 'Coming Soon', path: '/coming-soon' },
]

const DOT_NAVY = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='3' height='3'%3E%3Ccircle cx='2.5' cy='2.5' r='.5' fill='%23242a49'/%3E%3C/svg%3E\")"

export default function Layout({ children }) {
  const { pathname } = useLocation()

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>

      {/* SIDEBAR */}
      <div style={{
        width: 260,
        flexShrink: 0,
        backgroundColor: '#242a49',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto',
      }}>
        {/* Wordmark */}
        <div style={{
          padding: '24px 24px 20px',
          backgroundImage: DOT_NAVY,
          backgroundRepeat: 'repeat-x',
          backgroundPosition: 'bottom',
          paddingBottom: 22,
        }}>
          <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src={upstreamLogo} alt="" style={{ height: 18, width: 'auto', display: 'block', filter: 'brightness(0) invert(1)' }} />
            <span style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 21,
              fontWeight: 700,
              color: '#ffffff',
            }}>
              Project Upstream
            </span>
          </Link>
        </div>

        {/* Nav items */}
        <nav style={{ padding: '16px 0' }}>
          {NAV_ITEMS.map(item => {
            const isActive = pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  display: 'block',
                  padding: '10px 24px',
                  fontSize: 14,
                  fontWeight: 700,
                  color: isActive ? '#ffffff' : '#9ca3af',
                  textDecoration: 'none',
                  borderLeft: isActive ? '3px solid #ff335f' : '3px solid transparent',
                  backgroundColor: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
                  transition: 'all 0.15s ease',
                  fontFamily: 'Inter, sans-serif',
                }}
                onMouseEnter={e => {
                  if (!isActive) e.currentTarget.style.color = '#ffffff'
                }}
                onMouseLeave={e => {
                  if (!isActive) e.currentTarget.style.color = '#9ca3af'
                }}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

      </div>

      {/* MAIN CONTENT */}
      <div style={{
        flex: 1,
        backgroundColor: '#f3f2f1',
        overflowY: 'auto',
        minHeight: '100vh',
        padding: '0',
        boxSizing: 'border-box',
      }}>
        {children}
      </div>

    </div>
  )
}
