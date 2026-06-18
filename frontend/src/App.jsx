import { useState, useEffect, useCallback } from 'react';
import TopBar from './TopBar';
import { Link } from 'react-router-dom';
import upstreamLogo from './assets/upstream-removebg-preview.png';
import Map from 'react-map-gl/maplibre';
import { DeckGL } from '@deck.gl/react';
import { ScatterplotLayer } from '@deck.gl/layers';
import 'maplibre-gl/dist/maplibre-gl.css';

const BASEMAP = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

const INITIAL_VIEW = {
  longitude: -98.5,
  latitude: 39.5,
  zoom: 4,
  pitch: 0,
  bearing: 0,
};

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const T = {
  text:        '#1a1a1a',
  textSec:     '#6b7280',
  textMuted:   '#9ca3af',
  border:      '#e5e5e0',
  hoverBg:     '#f5f5f0',
  card:        'rgba(255,255,255,0.9)',
  activeTab:   '#1a1a1a',
  font:        "'Inter', system-ui, sans-serif",
  serif:       "Georgia, 'Times New Roman', serif",
};

// ---------------------------------------------------------------------------
// Dot colours — water consumption buckets (rgb arrays for deck.gl)
// ---------------------------------------------------------------------------

const DOT = {
  none:        [120, 113, 108, 200],  // #78716c
  negligible:  [219, 234, 254, 210],  // #dbeafe
  low:         [147, 197, 253, 210],  // #93c5fd
  medium:      [ 59, 130, 246, 210],  // #3b82f6
  high:        [ 29,  78, 216, 210],  // #1d4ed8
  veryHigh:    [ 30,  58,  95, 210],  // #1e3a5f
};

// Hex versions for legend
const DOT_HEX = {
  none:       '#78716c',
  negligible: '#dbeafe',
  low:        '#93c5fd',
  medium:     '#3b82f6',
  high:       '#1d4ed8',
  veryHigh:   '#1e3a5f',
};

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'water',       label: 'Water Use' },
  { id: 'electricity', label: 'Electricity' },
  { id: 'confidence',  label: 'Confidence' },
  { id: 'pipeline',    label: 'Pipeline' },
];

// ---------------------------------------------------------------------------
// Layer colour + radius per tab
// ---------------------------------------------------------------------------

function getLayerProps(tab, f) {
  const p = f.properties;
  const hasEstimate = p.annual_direct_water_liters != null;

  // radius
  let radius;
  if (tab === 'electricity') {
    const mwh = p.annual_electricity_mwh;
    radius = mwh != null && mwh > 0 ? Math.sqrt(mwh * 1000) * 0.5 : 8000;
  } else {
    const liters = p.annual_total_water_liters;
    radius = liters != null && liters > 0 ? Math.sqrt(liters) * 0.3 : 8000;
  }

  // colour
  let color;
  if (!hasEstimate) {
    color = DOT.none;
  } else if (tab === 'water') {
    const liters = p.annual_total_water_liters ?? 0;
    if (liters <= 0)      color = DOT.negligible;
    else if (liters < 5e8)  color = DOT.low;
    else if (liters < 2e9)  color = DOT.medium;
    else if (liters < 1e10) color = DOT.high;
    else                    color = DOT.veryHigh;
  } else if (tab === 'electricity') {
    const mwh = p.annual_electricity_mwh ?? 0;
    if (mwh < 10_000)      color = DOT.low;
    else if (mwh < 100_000) color = DOT.medium;
    else if (mwh < 500_000) color = DOT.high;
    else                    color = DOT.veryHigh;
  } else if (tab === 'confidence') {
    const { annual_direct_water_high: hi, annual_direct_water_low: lo, annual_direct_water_liters: dl } = p;
    if (hi == null || lo == null || !dl) {
      color = DOT.none;
    } else {
      const w = (hi - lo) / dl;
      if (w < 0.3)      color = DOT.veryHigh;
      else if (w < 0.7) color = DOT.high;
      else if (w < 1.2) color = DOT.medium;
      else if (w < 2.0) color = DOT.low;
      else              color = DOT.negligible;
    }
  } else {
    // pipeline / tier
    const MAP = { '1': DOT.veryHigh, '2': DOT.high, '3': DOT.medium, unestimable: DOT.none };
    color = MAP[p.tier] ?? DOT.none;
  }

  return { radius, color };
}

// ---------------------------------------------------------------------------
// Legend config per tab
// ---------------------------------------------------------------------------

const LEGENDS = {
  water: {
    title: 'Annual Water Use',
    items: [
      { color: DOT_HEX.veryHigh,  label: 'Very high (>10 BL)' },
      { color: DOT_HEX.high,      label: 'High (2–10 BL)' },
      { color: DOT_HEX.medium,    label: 'Medium (0.5–2 BL)' },
      { color: DOT_HEX.low,       label: 'Low (<0.5 BL)' },
      { color: DOT_HEX.negligible,label: 'Negligible' },
      { color: DOT_HEX.none,      label: 'No estimate' },
    ],
    note: 'Radius ∝ √ water use',
  },
  electricity: {
    title: 'Annual Electricity',
    items: [
      { color: DOT_HEX.veryHigh, label: '>500k MWh' },
      { color: DOT_HEX.high,     label: '100k–500k MWh' },
      { color: DOT_HEX.medium,   label: '10k–100k MWh' },
      { color: DOT_HEX.low,      label: '<10k MWh' },
      { color: DOT_HEX.none,     label: 'No estimate' },
    ],
    note: 'Radius ∝ √ electricity',
  },
  confidence: {
    title: 'CI Width (relative)',
    items: [
      { color: DOT_HEX.veryHigh,  label: 'Very narrow (<30%)' },
      { color: DOT_HEX.high,      label: 'Narrow (30–70%)' },
      { color: DOT_HEX.medium,    label: 'Moderate (70–120%)' },
      { color: DOT_HEX.low,       label: 'Wide (120–200%)' },
      { color: DOT_HEX.negligible,label: 'Very wide (>200%)' },
      { color: DOT_HEX.none,      label: 'No estimate' },
    ],
    note: 'Radius ∝ √ water use',
  },
  pipeline: {
    title: 'Estimation Tier',
    items: [
      { color: DOT_HEX.veryHigh,  label: 'Tier 1 — bottom-up' },
      { color: DOT_HEX.high,      label: 'Tier 2 — regression' },
      { color: DOT_HEX.medium,    label: 'Tier 3 — proxy' },
      { color: DOT_HEX.none,      label: 'Unestimable' },
    ],
    note: 'Radius ∝ √ water use',
  },
};

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function fmtBL(liters) {
  if (liters == null) return '—';
  const bl = liters / 1e9;
  return bl < 0.01 ? '<0.01 BL' : bl.toFixed(2) + ' BL';
}

function fmtMWh(v) {
  if (v == null) return '—';
  return Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' MWh';
}

function fmtNum(v, dec = 2) {
  if (v == null) return '—';
  return Number(v).toFixed(dec);
}

function waterStressHex(liters) {
  if (liters == null) return T.textMuted;
  if (liters < 5e8)   return '#16a34a';  // green
  if (liters < 2e9)   return '#d97706';  // amber
  return '#dc2626';                       // red
}

// ---------------------------------------------------------------------------
// Sidebar components
// ---------------------------------------------------------------------------

const SIDE_SECTION_HDR = {
  fontSize: 10,
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginTop: 16,
  marginBottom: 8,
  display: 'block',
};

function SBadge({ label }) {
  return (
    <span style={{
      fontSize: 11,
      padding: '2px 8px',
      borderRadius: 0,
      background: '#f5f5f0',
      color: '#6b7280',
      marginRight: 4,
    }}>{label}</span>
  );
}

function SRow({ label, value, sub, valueColor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 13, color: '#6b7280', flexShrink: 0 }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: valueColor ?? '#1a1a1a' }}>{value}</span>
        {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

function Sidebar({ facility, detail, onClose }) {
  if (!facility) return null;
  const p = facility.properties;
  const indirect_liters = p.annual_indirect_water_m3 != null ? p.annual_indirect_water_m3 * 1000 : null;
  const stressColor = waterStressHex(p.annual_total_water_liters);
  const ciSub = (lo, hi, fmt) => lo != null && hi != null ? `${fmt(lo)} – ${fmt(hi)}` : null;
  const demo = detail?.demographics?.[0] ?? null;
  const epa  = detail?.epa_compliance ?? null;

  return (
    <div style={{
      position: 'absolute',
      top: 0, right: 0,
      width: 320,
      height: '100%',
      background: '#ffffff',
      borderLeft: `1px solid ${T.border}`,
      zIndex: 30,
      overflowY: 'auto',
      padding: 20,
      fontFamily: T.font,
      boxSizing: 'border-box',
    }}>
      {/* close */}
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          position: 'absolute', top: 16, right: 16,
          background: 'none', border: 'none',
          color: '#9ca3af', fontSize: 20, cursor: 'pointer', lineHeight: 1,
        }}
      >×</button>

      {/* name */}
      <h2 style={{ margin: '0 24px 2px 0', fontSize: 18, fontWeight: 600, color: '#1a1a1a', lineHeight: 1.3 }}>
        {p.name}
      </h2>
      <p style={{ margin: '0 0 10px', fontSize: 14, color: '#6b7280' }}>
        {p.operator ?? '—'}
      </p>

      {/* badges */}
      <div style={{ marginBottom: 4 }}>
        {p.status    && <SBadge label={p.status.replace(/_/g, ' ')} />}
        {p.tier      && <SBadge label={`Tier ${p.tier}`} />}
        {p.size_class && <SBadge label={p.size_class} />}
      </div>

      {/* ── LOCATION ── */}
      <span style={SIDE_SECTION_HDR}>Location</span>
      <SRow label="State"  value={p.state ?? '—'} />
      <SRow label="Status" value={p.status?.replace(/_/g, ' ') ?? '—'} />

      {/* ── WATER CONSUMPTION ── */}
      <span style={SIDE_SECTION_HDR}>Water Consumption</span>
      <SRow label="Total"    value={fmtBL(p.annual_total_water_liters)}    valueColor={stressColor} />
      <SRow label="Direct"   value={fmtBL(p.annual_direct_water_liters)}   valueColor={stressColor}
            sub={ciSub(p.annual_direct_water_low, p.annual_direct_water_high, fmtBL)} />
      <SRow label="Indirect" value={fmtBL(indirect_liters)} />

      {/* ── ELECTRICITY ── */}
      <span style={SIDE_SECTION_HDR}>Electricity</span>
      <SRow label="Annual" value={fmtMWh(p.annual_electricity_mwh)}
            sub={ciSub(p.annual_electricity_low, p.annual_electricity_high, fmtMWh)} />

      {/* ── EFFICIENCY METRICS ── */}
      <span style={SIDE_SECTION_HDR}>Efficiency Metrics</span>
      <SRow label="PUE"        value={fmtNum(p.pue_estimate)}
            sub={ciSub(p.pue_low, p.pue_high, v => fmtNum(v))} />
      <SRow label="WUE (L/kWh)" value={fmtNum(p.wue_estimate)}
            sub={ciSub(p.wue_low, p.wue_high, v => fmtNum(v))} />

      {/* ── DEMOGRAPHICS ── */}
      <span style={SIDE_SECTION_HDR}>Demographics</span>
      {detail == null ? (
        <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 6px' }}>Loading…</p>
      ) : demo == null ? (
        <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 6px' }}>No demographic data.</p>
      ) : (
        <>
          <SRow label="Population"     value={demo.population?.toLocaleString('en-US') ?? '—'} />
          <SRow label="Median income"  value={demo.median_household_income != null
            ? '$' + Number(demo.median_household_income).toLocaleString('en-US', { maximumFractionDigits: 0 })
            : '—'} />
          <SRow label="Non-white"      value={demo.pct_nonwhite     != null ? Number(demo.pct_nonwhite).toFixed(1)     + '%' : '—'} />
          <SRow label="Below poverty"  value={demo.pct_below_poverty != null ? Number(demo.pct_below_poverty).toFixed(1) + '%' : '—'} />
        </>
      )}

      {/* ── EPA COMPLIANCE ── */}
      <span style={SIDE_SECTION_HDR}>EPA Compliance</span>
      {detail == null ? (
        <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 6px' }}>Loading…</p>
      ) : epa == null || epa.length === 0 ? (
        <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 6px' }}>No compliance records.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {epa.map((rec, i) => (
            <div key={i} style={{ padding: '7px 8px', background: '#f5f5f0', borderRadius: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#1a1a1a' }}>{rec.program}</span>
                {rec.penalty_amount != null && (
                  <span style={{ fontSize: 11, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                    ${Number(rec.penalty_amount).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                )}
              </div>
              {rec.violation_type && (
                <p style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 0' }}>{rec.violation_type}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* CTA */}
      <button style={{
        width: '100%',
        padding: 10,
        backgroundColor: '#242a49',
        color: '#ffffff',
        border: '1px solid #242a49',
        borderRadius: 0,
        fontSize: 14,
        fontWeight: 500,
        marginTop: 20,
        cursor: 'pointer',
        fontFamily: T.font,
      }}>
        Take Action
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legend — bottom right
// ---------------------------------------------------------------------------

function Legend({ tab, counts }) {
  const cfg = LEGENDS[tab];
  return (
    <div style={{
      position: 'absolute',
      bottom: 64,
      right: 16,
      zIndex: 10,
      backgroundColor: '#ffffff',
      border: '1px solid #242a49',
      borderRadius: 0,
      padding: '10px 12px',
      boxShadow: '4px 4px 0px #242a49',
      minWidth: 160,
      fontFamily: T.font,
    }}>
      <p style={{
        fontSize: 10, fontWeight: 600, color: '#6b7280',
        textTransform: 'uppercase', letterSpacing: '0.05em',
        margin: '0 0 6px',
      }}>
        {cfg.title}
      </p>
      {cfg.items.map(({ color, label }) => (
        <div
          key={label}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: 4, borderRadius: 4,
          }}
        >
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: color, flexShrink: 0, border: '1px solid rgba(0,0,0,0.08)' }} />
          <span style={{ fontSize: 12, color: '#1a1a1a', flex: 1 }}>{label}</span>
          {counts?.[label] != null && (
            <span style={{ fontSize: 10, color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>
              {counts[label]}
            </span>
          )}
        </div>
      ))}
      <p style={{ fontSize: 10, color: '#9ca3af', margin: '6px 0 0' }}>{cfg.note}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bottom-center tab bar (dcmap.us style pill bar)
// ---------------------------------------------------------------------------

const FILTER_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="6" x2="20" y2="6"/>
    <line x1="8" y1="12" x2="16" y2="12"/>
    <line x1="11" y1="18" x2="13" y2="18"/>
  </svg>
);

function TabBar({ active, onChange, count }) {
  return (
    <div style={{
      position: 'absolute',
      bottom: 12,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 20,
      display: 'flex',
      alignItems: 'center',
      backgroundColor: '#ffffff',
      border: '1px solid #242a49',
      borderRadius: 0,
      boxShadow: '4px 4px 0px #242a49',
      fontFamily: T.font,
    }}>
      {/* filter icon */}
      <button style={{
        height: 40,
        padding: '0 12px',
        background: 'none',
        border: 'none',
        borderRight: '1px solid #e5e5e0',
        color: '#9ca3af',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
      }}>
        {FILTER_ICON}
      </button>

      {/* divider */}
      <div style={{ width: 1, height: 24, background: '#e5e5e0' }} />

      {/* tabs */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '4px 6px', gap: 2 }}>
        {TABS.map(tab => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              style={{
                padding: '6px 12px',
                fontSize: 14,
                fontWeight: 500,
                borderRadius: 0,
                border: 'none',
                borderBottom: isActive ? '2px solid #ff335f' : '2px solid transparent',
                cursor: 'pointer',
                background: isActive ? '#242a49' : 'none',
                color: isActive ? '#ffffff' : '#6b7280',
                transition: 'background 0.15s, color 0.15s',
                fontFamily: T.font,
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* divider */}
      <div style={{ width: 1, height: 24, background: '#e5e5e0' }} />

      {/* count */}
      <span style={{
        padding: '8px 16px',
        fontSize: 14,
        color: '#9ca3af',
        whiteSpace: 'nowrap',
      }}>
        {count > 0 ? count.toLocaleString() + ' facilities' : '—'}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top-left title
// ---------------------------------------------------------------------------

function TitleCard() {
  return (
    <div style={{
      position: 'absolute',
      top: 20,
      left: 20,
      zIndex: 10,
      fontFamily: T.font,
    }}>
      <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
        <img src={upstreamLogo} alt="" style={{ height: 25, width: 'auto', display: 'block' }} />
        <h1 style={{
          margin: '4px 0 0',
          fontWeight: 700,
          color: '#1a1a1a',
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 24,
          letterSpacing: '0.02em',
          lineHeight: 1.1,
        }}>
          Project Upstream
        </h1>
      </Link>
      <p style={{ margin: '2px 0 0', fontSize: 14, color: '#6b7280', fontFamily: 'Inter, sans-serif' }}>
        Water &amp; energy footprint of U.S. data centers
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [facilities, setFacilities] = useState([]);
  const [selected, setSelected]     = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [viewState, setViewState]   = useState(INITIAL_VIEW);
  const [activeTab, setActiveTab]   = useState('water');
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('upstream_onboarding_dismissed');
    if (!dismissed) {
      const timer = setTimeout(() => setShowOnboarding(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1&countrycodes=us`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      if (data.length > 0) {
        const { lat, lon, display_name } = data[0];
        setSearchResult({ lat: parseFloat(lat), lon: parseFloat(lon), displayName: display_name });
        setViewState(v => ({
          ...v,
          latitude: parseFloat(lat),
          longitude: parseFloat(lon),
          zoom: 10,
          transitionDuration: 1000,
        }));
      }
    } catch (err) {
      console.error('Geocoding failed:', err);
    }
  };

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/facilities`)
      .then(r => r.json())
      .then(data => setFacilities(data.features ?? []))
      .catch(err => console.error('Failed to load facilities:', err));
  }, []);

  const handleClick = useCallback(({ object }) => {
    if (!object) return;
    setSelected(object);
    setDetailData(null);
    fetch(`${import.meta.env.VITE_API_URL}/facilities/${object.properties.id}`)
      .then(r => r.json())
      .then(data => setDetailData(data))
      .catch(err => console.error('Failed to load facility detail:', err));
  }, []);

  const layer = new ScatterplotLayer({
    id: `facilities-${activeTab}`,
    data: facilities,
    pickable: true,
    getPosition: f => f.geometry.coordinates,
    getRadius:    f => getLayerProps(activeTab, f).radius,
    getFillColor: f => getLayerProps(activeTab, f).color,
    getLineColor: [255, 255, 255, 80],
    stroked: true,
    lineWidthMinPixels: 0.5,
    radiusUnits: 'meters',
    radiusMinPixels: 3,
    radiusMaxPixels: 60,
    onClick: handleClick,
    updateTriggers: {
      getRadius:    [activeTab],
      getFillColor: [activeTab],
    },
  });

  const sidebarOpen = selected != null;

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TopBar />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#f5f5f0' }}>

      {/* Map + deck.gl */}
      <div style={{ position: 'absolute', inset: 0, right: sidebarOpen ? 320 : 0 }}>
        <DeckGL
          viewState={viewState}
          onViewStateChange={({ viewState: vs }) => setViewState(vs)}
          controller={true}
          layers={[layer]}
          style={{ width: '100%', height: '100%' }}
          getCursor={({ isHovering }) => isHovering ? 'pointer' : 'grab'}
        >
          <Map mapStyle={BASEMAP} />
        </DeckGL>
      </div>

      {/* Title — top left, no card bg per dcmap.us */}
      <TitleCard />

      {/* Search bar — top center */}
      <div style={{
        position: 'absolute',
        top: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        width: 420,
        maxWidth: '90vw',
      }}>
        {/* dot shadow layer */}
        <div style={{
          position: 'absolute',
          top: 4,
          left: 4,
          width: '100%',
          height: '100%',
          border: '1px solid #242a49',
          backgroundColor: 'rgba(36,42,73,0.15)',
          zIndex: 0,
        }} />
        {/* input */}
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Enter your address or zip code..."
          style={{
            position: 'relative',
            zIndex: 1,
            flex: 1,
            padding: '12px 16px',
            fontSize: 14,
            fontFamily: 'Inter, sans-serif',
            border: '1px solid #242a49',
            borderRight: 'none',
            backgroundColor: '#ffffff',
            outline: 'none',
            color: '#242a49',
          }}
        />
        {/* search button */}
        <button
          onClick={handleSearch}
          style={{
            position: 'relative',
            zIndex: 1,
            padding: '12px 16px',
            backgroundColor: '#242a49',
            border: '1px solid #242a49',
            color: '#ffffff',
            fontFamily: 'Inter, sans-serif',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Search →
        </button>
        {/* clear button — only shows after search */}
        {searchResult && (
          <button
            onClick={() => { setSearchResult(null); setSearchQuery(''); }}
            style={{
              position: 'absolute',
              right: 60,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 2,
              background: 'none',
              border: 'none',
              color: '#9ca3af',
              fontSize: 16,
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >×</button>
        )}
      </div>

      {/* Onboarding notification */}
      {showOnboarding && (
        <div style={{
          position: 'absolute',
          top: 76,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          backgroundColor: '#242a49',
          border: '1px solid #ff335f',
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          maxWidth: 420,
          width: '90vw',
          animation: 'slideDown 0.4s ease forwards',
        }}>
          <span style={{
            fontSize: 13,
            color: '#ffffff',
            fontFamily: 'Inter, sans-serif',
            lineHeight: 1.5,
            flex: 1,
          }}>
            Enter your address above to see the data centers near you and their environmental burden.
          </span>
          <button
            onClick={() => {
              setShowOnboarding(false);
              localStorage.setItem('upstream_onboarding_dismissed', 'true');
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#9ca3af',
              fontSize: 18,
              cursor: 'pointer',
              lineHeight: 1,
              flexShrink: 0,
            }}
          >×</button>
        </div>
      )}

      {/* Legend — bottom right */}
      <Legend tab={activeTab} />

      {/* Tab bar — bottom center */}
      <TabBar active={activeTab} onChange={setActiveTab} count={facilities.length} />

      {/* Sidebar */}
      <Sidebar
        facility={selected}
        detail={detailData}
        onClose={() => { setSelected(null); setDetailData(null); }}
      />
      </div>
    </div>
  );
}
