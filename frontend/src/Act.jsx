import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import TopBar from './TopBar'
import upstreamLogo from './assets/upstream-removebg-preview.png'
import Map from 'react-map-gl/maplibre'
import { DeckGL } from '@deck.gl/react'
import { ScatterplotLayer } from '@deck.gl/layers'
import 'maplibre-gl/dist/maplibre-gl.css'

const BASEMAP = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'

const INITIAL_VIEW = {
  longitude: -98.5,
  latitude: 39.5,
  zoom: 4,
  pitch: 0,
  bearing: 0,
}

export default function Act() {
  const [facilities, setFacilities] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [viewState, setViewState] = useState(INITIAL_VIEW)
  const [selectedFacility, setSelectedFacility] = useState(null)
  const [countyInfo, setCountyInfo] = useState(null)
  const [representatives, setRepresentatives] = useState([])
  const [repsLoading, setRepsLoading] = useState(false)
  const [letterPanel, setLetterPanel] = useState(false)
  const [letterData, setLetterData] = useState(null)
  const [letterLoading, setLetterLoading] = useState(false)
  const [selectedRep, setSelectedRep] = useState(null)
  const [countyBrief, setCountyBrief] = useState(null)

  useEffect(() => {
    fetch('/facilities')
      .then(r => r.json())
      .then(data => {
        const planned = (data.features ?? []).filter(f =>
          ['planned', 'under_construction', 'under construction'].includes(
            f.properties.status?.toLowerCase()
          )
        )
        setFacilities(planned)
      })
      .catch(err => console.error('Failed to load facilities:', err))
  }, [])

  const getCountyFromCoords = async (lat, lon) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
        { headers: { 'Accept-Language': 'en' } }
      )
      const data = await res.json()
      const county = data.address?.county?.replace(' County', '') ?? ''
      const state = data.address?.state ?? ''
      return { county, state }
    } catch (err) {
      console.error('Reverse geocoding failed:', err)
      return null
    }
  }

  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 3958.8
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2)
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1&countrycodes=us`,
        { headers: { 'Accept-Language': 'en' } }
      )
      const data = await res.json()
      if (data.length > 0) {
        const { lat, lon } = data[0]
        const parsedLat = parseFloat(lat)
        const parsedLon = parseFloat(lon)
        setSearchResult({ lat: parsedLat, lon: parsedLon })
        setViewState(v => ({ ...v, latitude: parsedLat, longitude: parsedLon, zoom: 9 }))
        setSelectedFacility(null)
        setLetterPanel(false)
        setLetterData(null)
        setCountyBrief(null)
        setRepresentatives([])
        setSelectedRep(null)

        const location = await getCountyFromCoords(parsedLat, parsedLon)
        if (location) {
          setCountyInfo(location)
          setRepsLoading(true)
          try {
            const repsRes = await fetch(`/representatives?lat=${parsedLat}&lon=${parsedLon}`)
            const repsData = await repsRes.json()
            console.log("REPS DATA:", repsData)
            setRepresentatives(repsData.officials ?? [])
          } catch (err) {
            console.error('Representatives fetch failed:', err)
          } finally {
            setRepsLoading(false)
          }
        }
      }
    } catch (err) {
      console.error('Geocoding failed:', err)
    }
  }

  const handleDraftLetter = async () => {
    if (!countyInfo) return
    setLetterPanel(true)
    setLetterLoading(true)
    setLetterData(null)
    setCountyBrief(null)

    const facilityId = selectedFacility?.properties?.id ?? null
    const repName = selectedRep?.name ?? ''
    const repOffice = selectedRep?.office ?? ''

    try {
      const [briefRes, letterRes] = await Promise.all([
        fetch(`/county-brief?lat=${searchResult.lat}&lon=${searchResult.lon}&county=${encodeURIComponent(countyInfo.county)}&state=${encodeURIComponent(countyInfo.state)}`),
        fetch(`/generate-letter?county=${encodeURIComponent(countyInfo.county)}&state=${encodeURIComponent(countyInfo.state)}${facilityId ? `&facility_id=${facilityId}` : ''}&representative_name=${encodeURIComponent(repName)}&representative_office=${encodeURIComponent(repOffice)}`)
      ])
      const [briefData, letterData] = await Promise.all([briefRes.json(), letterRes.json()])
      setCountyBrief(briefData)
      setLetterData(letterData)
    } catch (err) {
      console.error('Letter generation failed:', err)
    } finally {
      setLetterLoading(false)
    }
  }

  const handleOpenEmail = () => {
    if (!letterData) return
    if (!selectedRep?.email) {
      alert('Please select a representative with an email address.')
      return
    }
    const mailto = `mailto:${selectedRep.email}?subject=${encodeURIComponent(letterData.subject)}&body=${encodeURIComponent(letterData.body)}`
    window.open(mailto, '_blank')
  }

  const getSortedFacilities = () => {
    let list = [...facilities]
    if (searchResult) {
      list = list
        .map(f => ({
          ...f,
          distance: getDistance(searchResult.lat, searchResult.lon, f.geometry.coordinates[1], f.geometry.coordinates[0])
        }))
        .filter(f => f.distance <= 100)
        .sort((a, b) => (b.properties.annual_total_water_liters ?? 0) - (a.properties.annual_total_water_liters ?? 0))
    } else {
      list = list.sort((a, b) => (b.properties.annual_total_water_liters ?? 0) - (a.properties.annual_total_water_liters ?? 0))
    }
    return list.slice(0, 15)
  }

  const sortedFacilities = getSortedFacilities()

  const layer = new ScatterplotLayer({
    id: 'planned-facilities',
    data: facilities,
    pickable: true,
    getPosition: f => f.geometry.coordinates,
    getRadius: 8000,
    getFillColor: [255, 51, 95, 200],
    getLineColor: [255, 255, 255, 100],
    stroked: true,
    lineWidthMinPixels: 0.5,
    radiusMinPixels: 4,
    radiusMaxPixels: 20,
    onClick: ({ object }) => object && setSelectedFacility(object),
  })

  const partyColor = (party) => {
    if (!party) return '#9ca3af'
    if (party.toLowerCase().includes('democrat')) return '#2563eb'
    if (party.toLowerCase().includes('republican')) return '#dc2626'
    return '#9ca3af'
  }

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TopBar />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left panel */}
        <div style={{
          width: 420,
          flexShrink: 0,
          backgroundColor: '#ffffff',
          borderRight: '1px solid #e5e5e0',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Search */}
          <div style={{ padding: '20px 20px 16px', flexShrink: 0, borderBottom: '1px solid #e5e5e0' }}>
            <div style={{ position: 'relative', display: 'flex' }}>
              <div style={{
                position: 'absolute', top: 4, left: 4,
                width: '100%', height: '100%',
                border: '1px solid #242a49',
                backgroundColor: 'rgba(36,42,73,0.08)',
                zIndex: 0,
              }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Enter your zip code..."
                style={{
                  position: 'relative', zIndex: 1,
                  flex: 1,
                  padding: '10px 12px',
                  fontSize: 13,
                  fontFamily: 'Inter, sans-serif',
                  border: '1px solid #242a49',
                  borderRight: 'none',
                  backgroundColor: '#ffffff',
                  outline: 'none',
                  color: '#242a49',
                }}
              />
              <button
                onClick={handleSearch}
                style={{
                  position: 'relative', zIndex: 1,
                  padding: '10px 14px',
                  backgroundColor: '#242a49',
                  border: '1px solid #242a49',
                  color: '#ffffff',
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Search →
              </button>
            </div>
          </div>

          {/* Empty state */}
          {!searchResult && (
            <div style={{
              flex: 1,
              padding: '32px 20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
              paddingTop: '70%',
            }}>
              <div style={{
                width: 48, height: 48,
                border: '2px solid #ff335f',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 16,
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff335f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
              <p style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 20,
                color: '#242a49',
                letterSpacing: '0.05em',
                margin: '0 0 8px',
                textAlign: 'center',
              }}>
                Find planned data centers near you
              </p>
              <p style={{
                fontSize: 13,
                color: '#9ca3af',
                fontFamily: 'Inter, sans-serif',
                lineHeight: 1.6,
                margin: 0,
                textAlign: 'center',
              }}>
                Enter your address above to see planned facilities in your area and take action.
              </p>
            </div>
          )}

          {searchResult && (
            <div style={{ padding: '16px 20px' }}>

              {/* Draft Comment Letter button — always visible after search */}
              <div style={{ position: 'relative', display: 'inline-block', width: '100%', marginBottom: 20 }}>
                <div style={{
                  position: 'absolute', top: 4, left: 4,
                  width: '100%', height: '100%',
                  border: '1px solid #242a49',
                  backgroundColor: 'rgba(36,42,73,0.15)',
                  zIndex: 0,
                }} />
                <button
                  onClick={handleDraftLetter}
                  style={{
                    position: 'relative', zIndex: 1,
                    width: '100%',
                    padding: '10px 14px',
                    backgroundColor: '#ff335f',
                    border: '1px solid #242a49',
                    color: '#ffffff',
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  Draft Comment Letter →
                </button>
              </div>

              {/* Facilities */}
              <p style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#ff335f',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                fontFamily: 'Inter, sans-serif',
                margin: '0 0 4px',
              }}>
                {sortedFacilities.length > 0
                  ? `${sortedFacilities.length} planned facilities within 100 miles`
                  : 'No planned facilities found within 100 miles'}
              </p>
              <p style={{
                fontSize: 11,
                color: '#9ca3af',
                fontFamily: 'Inter, sans-serif',
                margin: '0 0 12px',
              }}>
                Ranked by estimated environmental impact. Click a facility to include it in your letter.
              </p>

              {sortedFacilities.map(f => {
                const p = f.properties
                const isSelected = selectedFacility?.properties?.id === p.id
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedFacility(isSelected ? null : f)}
                    style={{
                      border: isSelected ? '1px solid #ff335f' : '1px solid #e5e5e0',
                      padding: '12px',
                      marginBottom: 8,
                      cursor: 'pointer',
                      backgroundColor: isSelected ? '#fff8f8' : '#ffffff',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#242a49', fontFamily: 'Inter, sans-serif', marginBottom: 2 }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'Inter, sans-serif', marginBottom: 4 }}>
                      {p.state}
                      {f.distance != null && ` · ${Math.round(f.distance)} mi away`}
                      {p.tier && ` · Tier ${p.tier}`}
                    </div>
                    {p.annual_total_water_liters != null && (
                      <div style={{ fontSize: 12, color: '#242a49', fontFamily: 'Inter, sans-serif', fontWeight: 500 }}>
                        Est. {(p.annual_total_water_liters / 1e9).toFixed(1)} BL water/year
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Representatives */}
              <div style={{ marginTop: 24, borderTop: '1px solid #e5e5e0', paddingTop: 20, marginBottom: 8 }}>
                <p style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#ff335f',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  fontFamily: 'Inter, sans-serif',
                  margin: '0 0 12px',
                }}>
                  Your Representatives
                </p>

                {repsLoading && (
                  <p style={{ fontSize: 12, color: '#9ca3af', fontFamily: 'Inter, sans-serif', margin: 0 }}>
                    Loading representatives...
                  </p>
                )}

                {!repsLoading && representatives.length === 0 && (
                  <p style={{ fontSize: 12, color: '#9ca3af', fontFamily: 'Inter, sans-serif', margin: 0 }}>
                    No representatives found for this location.
                  </p>
                )}

                {!repsLoading && representatives.map((rep, i) => (
                  <div key={i} style={{
                    borderBottom: '1px solid #e5e5e0',
                    paddingBottom: 12,
                    marginBottom: 12,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#242a49', fontFamily: 'Inter, sans-serif', marginBottom: 2 }}>
                      {rep.name}
                      {rep.party && (
                        <span style={{
                          marginLeft: 8,
                          fontSize: 10,
                          fontWeight: 700,
                          color: partyColor(rep.party),
                          fontFamily: 'Inter, sans-serif',
                        }}>
                          {rep.party}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'Inter, sans-serif', marginBottom: 4 }}>
                      {rep.office}
                    </div>
                    {rep.phone && (
                      <div style={{ fontSize: 11, color: '#66615b', fontFamily: 'Inter, sans-serif', marginBottom: 2 }}>
                        {rep.phone}
                      </div>
                    )}
                    {rep.email && (
                      <a href={`mailto:${rep.email}`} style={{ fontSize: 11, color: '#ff335f', fontFamily: 'Inter, sans-serif', textDecoration: 'none', display: 'block' }}>
                        {rep.email}
                      </a>
                    )}
                  </div>
                ))}
              </div>

            </div>
          )}
        </div>

        {/* Letter panel */}
        {letterPanel && (
          <div style={{
            width: 400,
            flexShrink: 0,
            backgroundColor: '#ffffff',
            borderRight: '1px solid #e5e5e0',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* Header */}
            <div style={{
              padding: '20px 20px 16px',
              flexShrink: 0,
              borderBottom: '1px solid #e5e5e0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <p style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 20,
                color: '#242a49',
                margin: 0,
                letterSpacing: '0.05em',
              }}>
                Comment Letter
              </p>
              <button
                onClick={() => { setLetterPanel(false); setLetterData(null); setCountyBrief(null) }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#9ca3af',
                  fontSize: 20,
                  cursor: 'pointer',
                  lineHeight: 1,
                  padding: 0,
                }}
              >×</button>
            </div>

            <div style={{ padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Rep picker */}
              <div>
                <p style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#ff335f',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  fontFamily: 'Inter, sans-serif',
                  margin: '0 0 8px',
                }}>
                  Address To
                </p>
                {representatives.length === 0 && (
                  <p style={{ fontSize: 12, color: '#9ca3af', fontFamily: 'Inter, sans-serif', margin: 0 }}>
                    Search your zip code to load representatives.
                  </p>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {representatives.map((rep, i) => {
                    const isSelected = selectedRep?.name === rep.name
                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedRep(isSelected ? null : rep)}
                        style={{
                          padding: '4px 10px',
                          fontSize: 11,
                          fontFamily: 'Inter, sans-serif',
                          fontWeight: 600,
                          border: '1px solid #e5e5e0',
                          backgroundColor: isSelected ? '#242a49' : '#ffffff',
                          color: isSelected ? '#ffffff' : '#66615b',
                          cursor: 'pointer',
                        }}
                      >
                        {rep.name}
                      </button>
                    )
                  })}
                </div>
                {selectedRep?.email && (
                  <p style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'Inter, sans-serif', margin: '6px 0 0' }}>
                    Will send to: {selectedRep.email}
                  </p>
                )}
                {selectedRep && !selectedRep.email && (
                  <p style={{ fontSize: 11, color: '#ff335f', fontFamily: 'Inter, sans-serif', margin: '6px 0 0' }}>
                    No email on file for this representative.
                  </p>
                )}
              </div>

              {/* Letter loading */}
              {letterLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {['Researching your county...', 'Gathering facility data...', 'Drafting your letter...'].map((msg, i) => (
                    <div key={i} style={{
                      fontSize: 12,
                      color: '#9ca3af',
                      fontFamily: 'Inter, sans-serif',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}>
                      <div style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        backgroundColor: '#ff335f',
                        flexShrink: 0,
                      }} />
                      {msg}
                    </div>
                  ))}
                </div>
              )}

              {/* Letter content */}
              {letterData && !letterLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <p style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#ff335f',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      fontFamily: 'Inter, sans-serif',
                      margin: '0 0 4px',
                    }}>
                      Subject
                    </p>
                    <p style={{ fontSize: 13, color: '#242a49', fontFamily: 'Inter, sans-serif', margin: 0 }}>
                      {letterData.subject}
                    </p>
                  </div>

                  <div>
                    <p style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#ff335f',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      fontFamily: 'Inter, sans-serif',
                      margin: '0 0 4px',
                    }}>
                      Letter
                    </p>
                    <textarea
                      value={letterData.body}
                      onChange={e => setLetterData(d => ({ ...d, body: e.target.value }))}
                      style={{
                        width: '100%',
                        minHeight: 300,
                        border: '1px solid #e5e5e0',
                        padding: 12,
                        fontSize: 12,
                        fontFamily: 'Inter, sans-serif',
                        color: '#242a49',
                        lineHeight: 1.6,
                        resize: 'vertical',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <button
                    onClick={handleOpenEmail}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      backgroundColor: '#ff335f',
                      border: 'none',
                      color: '#ffffff',
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    Open in Email →
                  </button>
                  <p style={{
                    fontSize: 11,
                    color: '#9ca3af',
                    fontFamily: 'Inter, sans-serif',
                    margin: 0,
                    textAlign: 'center',
                  }}>
                    Letter will open in your default email client.
                  </p>
                </div>
              )}

              {/* County brief */}
              {countyBrief && !letterLoading && (
                <div style={{ borderTop: '1px solid #e5e5e0', paddingTop: 20 }}>
                  <p style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#ff335f',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    fontFamily: 'Inter, sans-serif',
                    margin: '0 0 12px',
                  }}>
                    {countyInfo?.county} County Intelligence Brief
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {['water', 'electric', 'legislative'].map(section => {
                      const data = countyBrief[section]
                      if (!data) return null
                      return (
                        <div key={section}>
                          <p style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#242a49',
                            fontFamily: 'Inter, sans-serif',
                            margin: '0 0 8px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                          }}>
                            {data.header}
                          </p>
                          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                            {(data.points ?? []).filter(Boolean).map((point, i) => (
                              <li key={i} style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 8,
                                marginBottom: 6,
                                fontSize: 12,
                                color: '#66615b',
                                fontFamily: 'Inter, sans-serif',
                                lineHeight: 1.6,
                              }}>
                                <div style={{
                                  width: 4,
                                  height: 4,
                                  borderRadius: '50%',
                                  backgroundColor: '#ff335f',
                                  flexShrink: 0,
                                  marginTop: 6,
                                }} />
                                {point}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* Map */}
        <div style={{ flex: 1, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 10, fontFamily: 'Inter, sans-serif', textAlign: 'right' }}>
            <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
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

          <div style={{
            position: 'absolute',
            bottom: 20,
            right: 20,
            zIndex: 10,
            backgroundColor: '#ffffff',
            border: '1px solid #242a49',
            boxShadow: '3px 3px 0 #242a49',
            padding: '8px 14px',
            fontFamily: 'Inter, sans-serif',
            fontSize: 12,
            color: '#242a49',
          }}>
            <span style={{ fontWeight: 700, color: '#ff335f' }}>{facilities.length}</span> planned facilities
          </div>
        </div>

      </div>
    </div>
  )
}
