import { Link, useLocation } from 'react-router-dom'

export default function TopBar() {
  const { pathname } = useLocation()
  const isMap = pathname === '/map'
  const isAct = pathname === '/act'

  return (
    <div style={{
      display: 'flex',
      width: '100%',
      height: 40,
      flexShrink: 0,
      zIndex: 100,
    }}>
      <Link to="/map" style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: 16,
        letterSpacing: '0.05em',
        textDecoration: 'none',
        backgroundColor: isMap ? '#ff335f' : '#242a49',
        color: isMap ? '#ffffff' : '#9ca3af',
        borderRight: '1px solid rgba(255,255,255,0.15)',
        transition: 'all 0.2s ease',
      }}>
        Explore the Data
      </Link>
      <Link to="/act" style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: 16,
        letterSpacing: '0.05em',
        textDecoration: 'none',
        backgroundColor: isAct ? '#ff335f' : '#242a49',
        color: isAct ? '#ffffff' : '#9ca3af',
        transition: 'all 0.2s ease',
      }}>
        Take Action
      </Link>
    </div>
  )
}
