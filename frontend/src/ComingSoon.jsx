import Layout from './Layout'

export default function ComingSoon() {
  return (
    <Layout>
      <div style={{ fontFamily: 'Inter, sans-serif', color: '#242a49', padding: '72px 64px 80px 140px', maxWidth: 1075 }}>

        <h1 style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 72,
          fontWeight: 700,
          color: '#242a49',
          lineHeight: 1.0,
          margin: '0 0 64px 0',
        }}>
          Coming Soon
        </h1>

        {[
          'A map and dashboard specifically dedicated to planned data center permits with a real-time search for active public comment periods on permits using FERC, state PUCs, and county planning boards.',
          'Pre-drafted, automatically generated public comment letters citing facility-specific water estimates, demographic data, and more for any facility with an open permit period.',
          'Facility-specific indirect water estimates replacing the current 1.8 m³/MWh national placeholder with regional water intensity data using eGRID.',
          'Each facility connected to its elected representatives for direct outreach using Google Civic API.',
          'Backtesting estimates against hyperscaler-disclosed WUE figures where available.',
        ].map((text, i) => (
          <div key={i} style={{ display: 'flex', gap: 24, margin: '0 0 28px 0' }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: '#ff335f', lineHeight: 1.8, flexShrink: 0, width: 20 }}>
              {i + 1}.
            </span>
            <p style={{ fontSize: 17, color: '#66615b', lineHeight: 1.8, margin: 0 }}>
              {text}
            </p>
          </div>
        ))}

      </div>
    </Layout>
  )
}
