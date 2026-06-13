import Layout from './Layout'

export default function About() {
  return (
    <Layout>
      <div style={{ fontFamily: 'Inter, sans-serif', color: '#242a49', padding: '72px 64px 80px 140px', maxWidth: 1075 }}>

        {/* ── Title ── */}
        <h1 style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 72,
          fontWeight: 700,
          color: '#242a49',
          lineHeight: 1.0,
          margin: '0 0 64px 0',
        }}>
          About
        </h1>

        <p style={{ fontSize: 17, color: '#66615b', lineHeight: 1.8, margin: '0 0 28px 0' }}>
          Data centers are one the fastest-growing consumers of fresh water in the United States.
          Can you believe it that a single hyperscale facility can use billions of liters of water
          annually on cooling alone, not to mention the other off-site operations that require even
          more water? This water is taken from the same municipal supplies that communities depend
          on for all their daily needs, and what makes it even worse is that barely anyone knows
          about it. No federal law requires public disclosure, and while many public databases track
          operating, in construction, and planned data centers across the country, many even
          displaying estimated power consumption from third-party resources, no tool attempts to
          standardize the estimation process in an applied way.
        </p>

        <p style={{ fontSize: 17, color: '#66615b', lineHeight: 1.8, margin: '0 0 28px 0' }}>
          In no way are the tools Project Upstream provides the public with completely accurate, and
          in no way are these tools digging up undisclosed information that nearly no average person
          can access — Project Upstream only attempts to build towards a world in which data centers'
          impact on the environment is transparent and documentable. While missing values or wide
          confidence intervals speak to the estimation aspect of Project Upstream, it speaks more to
          the scale of the lack of public transparency and, therefore, its necessity. While Project
          Upstream desires to provide accurate information, its broader mission is to fuel a movement
          of citizens that demand accountability from the decision-makers upstream of our water, our
          air, and our futures.
        </p>

        <p style={{ fontSize: 17, color: '#66615b', lineHeight: 1.8, margin: '0 0 28px 0' }}>
          Project Upstream was built by Anthony Sharf (that's me!), an incoming student at UC
          Berkeley (Class of 2030) studying Data Science at the College of Computing, Data Science,
          and Society. Project Upstream began as a research project and became a civic tool.
        </p>

        <p style={{ fontSize: 17, color: '#66615b', lineHeight: 1.8, margin: '0 0 32px 0' }}>
          This is an open project. If you're a researcher, journalist, community organizer,
          engineer, or anyone who does cool stuff who wants to contribute or is interested,
          reach out.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <a
            href="mailto:anthonysharf@berkeley.edu"
            style={{ fontSize: 16, fontWeight: 600, color: '#242a49', textDecoration: 'none', borderBottom: '1px solid #ff335f', paddingBottom: 2, width: 'fit-content' }}
            onMouseEnter={e => e.currentTarget.style.color = '#ff335f'}
            onMouseLeave={e => e.currentTarget.style.color = '#242a49'}
          >
            anthonysharf@berkeley.edu
          </a>
          <a
            href="https://anthonysharf.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 16, fontWeight: 600, color: '#242a49', textDecoration: 'none', borderBottom: '1px solid #ff335f', paddingBottom: 2, width: 'fit-content' }}
            onMouseEnter={e => e.currentTarget.style.color = '#ff335f'}
            onMouseLeave={e => e.currentTarget.style.color = '#242a49'}
          >
            anthonysharf.com
          </a>
          <a
            href="https://www.linkedin.com/in/anthonysharf/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 16, fontWeight: 600, color: '#242a49', textDecoration: 'none', borderBottom: '1px solid #ff335f', paddingBottom: 2, width: 'fit-content' }}
            onMouseEnter={e => e.currentTarget.style.color = '#ff335f'}
            onMouseLeave={e => e.currentTarget.style.color = '#242a49'}
          >
            linkedin.com/in/anthonysharf
          </a>
        </div>

      </div>
    </Layout>
  )
}
