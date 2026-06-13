import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import upstreamLogo from './assets/upstream-removebg-preview.png';
import first from './assets/first.png';
import second from './assets/second.png';
import third from './assets/third.png';
import fourth from './assets/fourth.png';
import fifth from './assets/fifth.png';

const STEP_IMAGES = [first, second, third, fourth, fifth];
const DATA_PILLS_BG = "url('https://mrkp-static-production.themarkup.org/static/img/data-pills.svg')";

const DOTS_PINK = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='3' height='3'%3E%3Ccircle cx='2.5' cy='2.5' r='.5' fill='%23ff335f'/%3E%3C/svg%3E\")";

const SCROLLY_STEPS = [
  { headline: 'A data center gets built near your town.', sub: '' },
  { headline: 'The permit is filed. The comment period passes. Nobody shows up.', sub: '' },
  { headline: 'It starts drawing from your local water supply.', sub: 'Billions of liters a year.' },
  { headline: 'No disclosure. No public notice. No way to know.', sub: '' },
  { headline: 'Until now.', sub: 'Project Upstream maps the water footprint of every data center in America.' },
];

const DOTS_NAVY = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='3' height='3'%3E%3Ccircle cx='2.5' cy='2.5' r='.5' fill='%23242a49'/%3E%3C/svg%3E\")";

export default function Landing() {
  const [btnHovered, setBtnHovered] = useState(false);
  const [scrollyStep, setScrollyStep] = useState(0);
  const [step4BtnHovered, setStep4BtnHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuBtnHovered, setMenuBtnHovered] = useState(false);
  const [hoveredMenuItem, setHoveredMenuItem] = useState(null);
  const [wordmarkHovered, setWordmarkHovered] = useState(false);
  const scrollyRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!scrollyRef.current) return;
      const sectionTop = scrollyRef.current.offsetTop;
      const stepHeight = window.innerHeight * 0.8;
      const raw = Math.floor((window.scrollY - sectionTop) / stepHeight);
      setScrollyStep(Math.min(Math.max(raw, 0), 4));
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f3f2f1',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      color: '#000',
    }}>

      {/* ── Site Header ── */}
      <header style={{ backgroundColor: '#f3f2f1', position: 'relative', zIndex: 100 }}>
        {/* Outer padding wrapper — matches .site-header__nav padding: 0 5vw */}
        <div style={{ padding: '0 13vw' }}>
          {/*
            Nav inner: flex row with pink dot line repeat-x at bottom.
            Logo is absolutely positioned and centered, with backgroundColor
            matching the page bg to visually interrupt (mask) the dot line.
          */}
          <div style={{
            position: 'relative',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            paddingTop: '10px',
            paddingBottom: '22px',
            backgroundImage: DOTS_PINK,
            backgroundRepeat: 'repeat-x',
            backgroundPosition: 'left bottom',
          }}>

            {/* Left — menu toggle */}
            <button
              onClick={() => setMenuOpen(o => !o)}
              onMouseEnter={() => setMenuBtnHovered(true)}
              onMouseLeave={() => setMenuBtnHovered(false)}
              style={{
                fontFamily: "'DM Sans', system-ui, sans-serif",
                fontSize: '16px',
                fontWeight: 700,
                color: menuBtnHovered ? '#ff335f' : '#000',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                whiteSpace: 'nowrap',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                position: 'relative',
                top: '10px',
              }}
            >
              Menu
              <svg
                width="12" height="12" viewBox="0 0 12 12"
                fill="none" stroke="#ff335f" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
                style={{
                  transform: menuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease',
                  marginTop: 1,
                }}
              >
                <polyline points="2 4 6 8 10 4" />
              </svg>
            </button>

            {/*
              Center — Wordmark, absolutely positioned.
              Mirrors: .site-header--home .site-header__branding @690px+
                position: absolute; top: 24px; left: 0; right: 0;
                margin: auto; width: 330px; background-color: #f3f2f1
              The backgroundColor here is the "logo-bg" trick that masks
              the pink dot line running behind the wordmark.
            */}
            <div
              onMouseEnter={() => setWordmarkHovered(true)}
              onMouseLeave={() => setWordmarkHovered(false)}
              style={{
                position: 'absolute',
                top: '24px',
                left: 0,
                right: 0,
                margin: 'auto',
                width: 'fit-content',
                backgroundColor: '#f3f2f1',
                textAlign: 'center',
                padding: '3px 16px',
                zIndex: 3,
                whiteSpace: 'nowrap',
                cursor: 'default',
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: '72px',
                fontWeight: 900,
                color: wordmarkHovered ? '#ff335f' : '#242a49',
                lineHeight: 1,
                letterSpacing: '0.01em',
                whiteSpace: 'nowrap',
                transition: 'color 0.2s ease',
              }}>
                <span>Project</span>
                <img
                  src={upstreamLogo}
                  alt=""
                  style={{ height: 52, width: 'auto', display: 'block' }}
                />
                <span>Upstream</span>
              </div>
            </div>

            {/* Right — logo + offset-shadow CTA button */}
            <div style={{ display: 'flex', alignItems: 'flex-end', position: 'relative', top: '6px' }}>

              {/*
                Offset-shadow button — replicates The Markup's .button pattern:
                  ::before  top 3px left 3px — shadow layer 1
                  ::after   top 6px left 6px — shadow layer 2
                  face      position relative z-index 3
              */}
              <div style={{ position: 'relative', display: 'inline-block', marginLeft: '24px' }}>
                {/* shadow layer 1 */}
                <div style={{
                  position: 'absolute',
                  top: '3px',
                  left: '3px',
                  width: '100%',
                  height: '100%',
                  border: '1px solid #242a49',
                  backgroundColor: '#f3f2f1',
                  zIndex: 1,
                }} />
                {/* shadow layer 2 */}
                <div style={{
                  position: 'absolute',
                  top: '6px',
                  left: '6px',
                  width: '100%',
                  height: '100%',
                  border: '1px solid #242a49',
                  backgroundColor: '#f3f2f1',
                  zIndex: 0,
                }} />
                {/* button face */}
                <Link
                  to="/map"
                  onMouseEnter={() => setBtnHovered(true)}
                  onMouseLeave={() => setBtnHovered(false)}
                  style={{
                    position: 'relative',
                    zIndex: 2,
                    display: 'block',
                    border: '1px solid #242a49',
                    padding: '10px 16px',
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    fontWeight: 700,
                    fontSize: '16px',
                    color: '#000',
                    backgroundColor: '#fff',
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                    transform: btnHovered ? 'translate(0, 0)' : 'translate(3px, 3px)',
                    transition: 'transform 0.15s ease',
                  }}
                >
                  Explore the Map →
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* ── Dropdown backdrop (click-outside to close) ── */}
        {menuOpen && (
          <div
            onClick={() => setMenuOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 150 }}
          />
        )}

        {/* ── Dropdown Menu Panel ── */}
        {menuOpen && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '13vw',
            zIndex: 200,
          }}>
            {/* dot-pattern shadow layer */}
            <div style={{
              position: 'absolute',
              top: 6,
              left: 6,
              width: '100%',
              height: '100%',
              backgroundImage: DOTS_NAVY,
              backgroundRepeat: 'repeat',
              zIndex: 0,
            }} />
            {/* panel face */}
            <div style={{
              position: 'relative',
              zIndex: 1,
              backgroundColor: '#242a49',
              border: '1px solid #242a49',
              minWidth: 200,
              paddingTop: 8,
              paddingBottom: 8,
            }}>
              {[
                { label: 'About', to: '/about' },
                { label: 'Methodology', to: '/methodology' },
                { label: 'Coming Soon', to: '/coming-soon' },
              ].map(({ label, to }) => (
                <Link
                  key={label}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  onMouseEnter={() => setHoveredMenuItem(label)}
                  onMouseLeave={() => setHoveredMenuItem(null)}
                  style={{
                    display: 'block',
                    padding: '10px 24px',
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    fontSize: 15,
                    fontWeight: 700,
                    color: hoveredMenuItem === label ? '#ff335f' : '#ffffff',
                    textDecoration: 'none',
                    cursor: 'pointer',
                    transition: 'color 0.15s ease',
                  }}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </header>

      {/*
        ── Mission / Hero ──
        Mirrors body.homepage main  →  padding: 0 18px (mobile) / 0 30px (desktop)
        and .mission CSS:
          background: url(data-pills.svg) center center / contain no-repeat
          max-width: 35ch
          padding: 60px 0 (90px on tablet+)
          text-align: center
          margin: 0 auto
      */}
      <main style={{ padding: '0 13vw', maxWidth: 1100, margin: '0 auto' }}>
        <div>
          <section style={{
            backgroundImage: DATA_PILLS_BG,
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center center',
            fontSize: '30px',
            lineHeight: 1.1,
            margin: '0 auto',
            maxWidth: '35ch',
            padding: '140px 0',
            textAlign: 'center',
          }}>
            {/*
              .mission__primary
              font-family: ivar-display (→ Playfair Display)
              font-size: size05 = 36px, line-height: 1.1
              padding: 0 20px
            */}
            <h1 style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontWeight: 700,
              fontSize: '36px',
              lineHeight: 1.1,
              color: '#000',
              margin: 0,
              padding: '0 40px',
            }}>
              Project Upstream exists because your community's water is funding the internet.
            </h1>

            {/*
              .mission__secondary
              font-size: size02 = 21px, line-height: 1.4, margin-top: 12px
            */}
            <div style={{
              fontSize: '21px',
              lineHeight: 1.4,
              marginTop: '12px',
              color: '#000',
            }}>
              <p style={{ margin: 0, padding: '0 20px' }}>
                Our estimates are facility-level, transparent, and built on peer-reviewed methodology. Explore the{' '}
                <Link to="/map" style={{ color: '#242a49', textDecoration: 'underline', textDecorationStyle: 'dotted', textDecorationColor: '#242a49', textDecorationThickness: '1px', textUnderlineOffset: '3px' }}>map</Link>
                , read the{' '}
                <a href="#methodology" style={{ color: '#242a49', textDecoration: 'underline', textDecorationStyle: 'dotted', textDecorationColor: '#242a49', textDecorationThickness: '1px', textUnderlineOffset: '3px' }}>methodology</a>
                , and{' '}
                <a href="#action" style={{ color: '#242a49', textDecoration: 'underline', textDecorationStyle: 'dotted', textDecorationColor: '#242a49', textDecorationThickness: '1px', textUnderlineOffset: '3px' }}>take action in your community</a>
                .
              </p>
            </div>
          </section>
        </div>
      </main>

      {/* ── Scrollytelling ── */}
      <div style={{ height: '80px' }} />
      <div ref={scrollyRef} style={{ height: '500vh', position: 'relative' }}>
        {/* Scroll indicator — sits above sticky panel */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 0 0',
          backgroundColor: '#242a49',
        }}>
          <span style={{
            fontSize: 13,
            fontWeight: 700,
            color: '#ffffff',
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            fontFamily: 'Inter, sans-serif',
            marginBottom: 16,
          }}>Scroll to explore</span>
          <div style={{
            width: 4,
            height: 64,
            backgroundColor: 'rgba(255,255,255,0.2)',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              backgroundColor: '#ff335f',
              animation: 'scrollDown 1.4s ease-in-out infinite',
              height: '40%',
            }} />
          </div>
        </div>
        <div style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          backgroundColor: '#242a49',
          overflow: 'hidden',
        }}>
          {/* Content — both layouts always in DOM, opacity-toggled */}
          <div style={{ position: 'relative', height: '100%', width: '100%' }}>

            {/* Two-column layout — steps 0–3 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              height: '100%',
              width: '100%',
              opacity: scrollyStep === 4 ? 0 : 1,
              transform: scrollyStep === 4 ? 'translateY(16px)' : 'translateY(0px)',
              transition: 'opacity 0.6s ease, transform 0.6s ease',
              position: 'absolute',
              top: 0,
              left: 0,
              padding: '0 11vw',
              boxSizing: 'border-box',
              pointerEvents: scrollyStep === 4 ? 'none' : 'auto',
              gap: 60,
            }}>
              {/* Left column — text */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: 12, color: '#ff335f', fontFamily: 'Inter, sans-serif', letterSpacing: '0.1em', marginBottom: 24 }}>
                  0{scrollyStep + 1} / 05
                </div>
                <div style={{ height: 2, width: 48, backgroundColor: '#ff335f', marginBottom: 24 }} />
                <div style={{ position: 'relative', minHeight: 220 }}>
                  {SCROLLY_STEPS.slice(0, 4).map((step, i) => (
                    <div
                      key={i}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        opacity: scrollyStep === i ? 1 : 0,
                        transform: scrollyStep === i ? 'translateY(0px)' : 'translateY(16px)',
                        transition: 'opacity 0.4s ease, transform 0.4s ease',
                        pointerEvents: scrollyStep === i ? 'auto' : 'none',
                      }}
                    >
                      <h2 style={{
                        fontFamily: "'Bebas Neue', sans-serif",
                        fontSize: 42,
                        fontWeight: 700,
                        color: '#ffffff',
                        lineHeight: 1.2,
                        margin: 0,
                      }}>
                        {step.headline}
                      </h2>
                      {step.sub && (
                        <p style={{ fontSize: 20, color: '#9ca3af', fontFamily: 'Inter, sans-serif', lineHeight: 1.6, margin: '16px 0 0 0' }}>
                          {step.sub}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {/* Right column — illustration */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ position: 'relative', width: '100%', maxWidth: 460, aspectRatio: '1' }}>
                  {STEP_IMAGES.slice(0, 4).map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        opacity: scrollyStep === i ? 1 : 0,
                        transform: scrollyStep === i ? 'scale(1)' : 'scale(0.96)',
                        transition: 'opacity 0.6s ease, transform 0.6s ease',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Step 5 breakout — centered */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              width: '100%',
              opacity: scrollyStep === 4 ? 1 : 0,
              transform: scrollyStep === 4 ? 'translateY(0px)' : 'translateY(16px)',
              transition: 'opacity 0.6s ease, transform 0.6s ease',
              position: 'absolute',
              top: 0,
              left: 0,
              textAlign: 'center',
              boxSizing: 'border-box',
              pointerEvents: scrollyStep === 4 ? 'auto' : 'none',
            }}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '0 5vw',
                maxWidth: 700,
                margin: '0 auto',
                transform: 'translateY(-2%)',
              }}>
                <img
                  src={fifth}
                  style={{
                    width: 368,
                    height: 368,
                    objectFit: 'contain',
                    marginBottom: 40,
                  }}
                />
                <p style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#ff335f',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  fontFamily: 'Inter, sans-serif',
                  margin: '0 0 16px 0',
                }}>05 / 05</p>
                <h2 style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 52,
                  fontWeight: 700,
                  color: '#ffffff',
                  lineHeight: 1.15,
                  margin: '0 0 16px',
                }}>Until now.</h2>
                <p style={{
                  fontSize: 20,
                  color: '#9ca3af',
                  lineHeight: 1.6,
                  fontFamily: 'Inter, sans-serif',
                  maxWidth: 500,
                  margin: '0 0 40px 0',
                }}>
                  Project Upstream maps the water footprint of every data center in America.
                </p>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <div style={{ position: 'absolute', top: 3, left: 3, width: '100%', height: '100%', border: '1px solid #ff335f', backgroundColor: '#1a1a1a', zIndex: 1 }} />
                  <div style={{ position: 'absolute', top: 6, left: 6, width: '100%', height: '100%', border: '1px solid #ff335f', backgroundColor: '#1a1a1a', zIndex: 0 }} />
                  <Link
                    to="/map"
                    onMouseEnter={() => setStep4BtnHovered(true)}
                    onMouseLeave={() => setStep4BtnHovered(false)}
                    style={{
                      position: 'relative',
                      zIndex: 2,
                      display: 'block',
                      border: '1px solid #ff335f',
                      padding: '14px 28px',
                      fontWeight: 700,
                      fontSize: 16,
                      color: '#ffffff',
                      backgroundColor: '#ff335f',
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                      fontFamily: 'Inter, sans-serif',
                      transform: step4BtnHovered ? 'translate(0, 0)' : 'translate(3px, 3px)',
                      transition: 'transform 0.15s ease',
                    }}
                  >
                    Explore the Map →
                  </Link>
                </div>
              </div>
            </div>

          </div>
          {/* Bouncing chevron — step 5 only */}
          <div style={{
            position: 'absolute',
            bottom: 32,
            left: '50%',
            transform: 'translateX(-50%)',
            opacity: scrollyStep === 4 ? 1 : 0,
            transition: 'opacity 0.6s ease',
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0,
          }}>
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ animation: 'bounce 1.6s ease-in-out infinite' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ animation: 'bounce 1.6s ease-in-out infinite', animationDelay: '0.2s' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
          {/* Progress dots */}
          <div style={{
            position: 'absolute',
            right: 40,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            {SCROLLY_STEPS.map((_, i) => (
              <div key={i} style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: scrollyStep === i ? '#ff335f' : 'rgba(255,255,255,0.2)',
                transition: 'background-color 0.3s ease',
              }} />
            ))}
          </div>
        </div>
      </div>

      <div style={{ height: '80px' }} />

      {/* ── Section 2: For Citizens ── */}
      <div style={{ padding: '80px 5vw' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 60 }}>
          {/* Left */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#ff335f', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12, fontFamily: 'Inter, sans-serif' }}>
              For Your Community
            </div>
            <h2 style={{ fontSize: 36, fontWeight: 700, fontFamily: "'Bebas Neue', sans-serif", color: '#242a49', lineHeight: 1.2, marginBottom: 16, margin: '0 0 16px 0' }}>
              Data centers near you are drawing from your local water supply.
            </h2>
            <p style={{ fontSize: 16, color: '#66615b', lineHeight: 1.7, marginBottom: 24, fontFamily: 'Inter, sans-serif', margin: '0 0 24px 0' }}>
              Most communities have no idea this is happening. Project Upstream gives you facility-level estimates for every data center in America — so you can see exactly what's being drawn from your watershed.
            </p>
            <Link to="/map" style={{ color: '#242a49', fontWeight: 700, fontSize: 15, textDecoration: 'none', borderBottom: '2px solid #ff335f', paddingBottom: 2, fontFamily: 'Inter, sans-serif' }}>
              Find facilities near you →
            </Link>
          </div>
          {/* Right */}
          <div style={{ flex: 1, height: 300, backgroundColor: '#e5e5e0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#9ca3af', fontFamily: 'Inter, sans-serif', fontSize: 14 }}>Map preview</span>
          </div>
        </div>
      </div>

      {/* ── Section 3: For Activists ── */}
      <div style={{ backgroundColor: '#f8f7f6', width: '100%', padding: '80px 5vw', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 60 }}>
          {/* Left — visual */}
          <div style={{ flex: 1, height: 300, backgroundColor: '#e5e5e0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#9ca3af', fontFamily: 'Inter, sans-serif', fontSize: 14 }}>Comment letter mockup</span>
          </div>
          {/* Right — text */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#ff335f', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12, fontFamily: 'Inter, sans-serif' }}>
              For Advocates &amp; Journalists
            </div>
            <h2 style={{ fontSize: 36, fontWeight: 700, fontFamily: "'Bebas Neue', sans-serif", color: '#242a49', lineHeight: 1.2, margin: '0 0 16px 0' }}>
              Data centers need permits. You have the right to weigh in.
            </h2>
            <p style={{ fontSize: 16, color: '#66615b', lineHeight: 1.7, fontFamily: 'Inter, sans-serif', margin: '0 0 24px 0' }}>
              Use our facility-level water estimates to submit public comments, challenge permits, and hold operators accountable. Project Upstream generates pre-drafted comment letters tied to specific facilities.
            </p>
            <a href="#" style={{ color: '#242a49', fontWeight: 700, fontSize: 15, textDecoration: 'none', borderBottom: '2px solid #ff335f', paddingBottom: 2, fontFamily: 'Inter, sans-serif' }}>
              Generate a comment letter →
            </a>
          </div>
        </div>
      </div>

      {/* ── Section 4: For Researchers ── */}
      <div style={{ padding: '80px 5vw' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 60 }}>
          {/* Left */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#ff335f', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12, fontFamily: 'Inter, sans-serif' }}>
              For Researchers &amp; Policy
            </div>
            <h2 style={{ fontSize: 36, fontWeight: 700, fontFamily: "'Bebas Neue', sans-serif", color: '#242a49', lineHeight: 1.2, margin: '0 0 16px 0' }}>
              Facility-level estimates. Peer-reviewed methodology. Open data.
            </h2>
            <p style={{ fontSize: 16, color: '#66615b', lineHeight: 1.7, fontFamily: 'Inter, sans-serif', margin: '0 0 24px 0' }}>
              Built on Lei &amp; Masanet (2022). Every estimate includes confidence intervals derived from Latin Hypercube Sampling. Full methodology published. Data downloadable.
            </p>
            <div style={{ display: 'flex', gap: 32 }}>
              <a href="#methodology" style={{ color: '#242a49', fontWeight: 700, fontSize: 15, textDecoration: 'none', borderBottom: '2px solid #ff335f', paddingBottom: 2, fontFamily: 'Inter, sans-serif' }}>
                Read the methodology →
              </a>
              <a href="#" style={{ color: '#242a49', fontWeight: 700, fontSize: 15, textDecoration: 'none', borderBottom: '2px solid #ff335f', paddingBottom: 2, fontFamily: 'Inter, sans-serif' }}>
                Download the data →
              </a>
            </div>
          </div>
          {/* Right */}
          <div style={{ flex: 1, height: 300, backgroundColor: '#e5e5e0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#9ca3af', fontFamily: 'Inter, sans-serif', fontSize: 14 }}>Methodology diagram</span>
          </div>
        </div>
      </div>

      {/* ── Pink dot divider ── */}
      <div style={{
        width: '100%',
        height: 12,
        backgroundImage: DOTS_PINK,
        backgroundRepeat: 'repeat-x',
        backgroundPosition: 'left center',
      }} />

      {/* ── Section 5: Footer ── */}
      <footer style={{
        width: '100%',
        backgroundColor: '#242a49',
        padding: '48px 5vw',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: 32,
        boxSizing: 'border-box',
      }}>
        {/* Left — wordmark */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'Bebas Neue', sans-serif", fontSize: 23, fontWeight: 700, color: '#ffffff' }}>
            <img src={upstreamLogo} alt="" style={{ height: 20, width: 'auto', display: 'block', filter: 'brightness(0) invert(1)' }} />
            Project Upstream
          </div>
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 8, fontFamily: 'Inter, sans-serif' }}>
            The hidden water cost of America's data centers.
          </div>
        </div>
        {/* Center — nav links */}
        <div>
          {[
            { label: 'About', href: '#about' },
            { label: 'Methodology', href: '#methodology' },
            { label: 'Data', href: '#' },
            { label: 'GitHub', href: '#' },
          ].map(({ label, href }) => (
            <a
              key={label}
              href={href}
              style={{ display: 'block', color: '#9ca3af', fontSize: 14, textDecoration: 'none', marginBottom: 8, fontFamily: 'Inter, sans-serif' }}
              onMouseEnter={e => e.currentTarget.style.color = '#ffffff'}
              onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
            >
              {label}
            </a>
          ))}
        </div>
        {/* Right — attribution */}
        <div>
          <div style={{ fontSize: 13, color: '#9ca3af', fontFamily: 'Inter, sans-serif' }}>
            Built with peer-reviewed methodology.
          </div>
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 8, fontFamily: 'Inter, sans-serif' }}>
            © 2025 Project Upstream
          </div>
        </div>
      </footer>

    </div>
  );
}
