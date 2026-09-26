import type { ReactNode } from 'react'

const editorHref = `${import.meta.env.BASE_URL}editor`

const ArrowIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
    <path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const CheckIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 18 18" fill="none">
    <path d="m4 9 3.1 3.1L14 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const FeatureIcon = ({ children }: { children: ReactNode }) => (
  <span className="landing-feature__icon" aria-hidden="true">{children}</span>
)

function Brand() {
  return (
    <a className="landing-brand" href="/" aria-label="Kami home">
      <span className="landing-brand__mark"><i /><i /><i /></span>
      <span>Kami</span>
    </a>
  )
}

function EditorPreview() {
  return (
    <div className="landing-preview" aria-label="Preview of the Kami screenshot editor">
      <div className="landing-preview__glow" />
      <div className="landing-window">
        <div className="landing-window__bar">
          <div className="landing-window__dots" aria-hidden="true"><i /><i /><i /></div>
          <div className="landing-window__title"><span className="landing-mini-mark" /> App launch · screenshot-studio.json</div>
          <span className="landing-window__saved"><i /> Saved</span>
        </div>
        <div className="landing-window__body">
          <aside className="landing-preview__rail" aria-hidden="true">
            <span className="landing-rail-logo">K</span>
            <span className="landing-rail-item is-active"><b /><b /><b /></span>
            <span className="landing-rail-item"><b /><b /></span>
            <span className="landing-rail-item"><b /><b /><b /></span>
            <span className="landing-rail-spacer" />
            <span className="landing-rail-avatar" />
          </aside>
          <aside className="landing-preview__slides" aria-hidden="true">
            <div className="landing-preview__label">SLIDES <span>3</span></div>
            <div className="landing-mini-slide is-selected">
              <div className="landing-mini-slide__copy">Focus on<br />what matters.</div>
              <div className="landing-mini-phone" />
            </div>
            <div className="landing-mini-slide landing-mini-slide--mint">
              <div className="landing-mini-slide__copy">Every detail,<br />one story.</div>
              <div className="landing-mini-phone" />
            </div>
            <div className="landing-mini-slide landing-mini-slide--peach">
              <div className="landing-mini-slide__copy">Made to<br />move people.</div>
              <div className="landing-mini-phone" />
            </div>
          </aside>
          <div className="landing-preview__workspace">
            <div className="landing-preview__mode"><span className="is-active">Isolated</span><span>Panoramic</span></div>
            <div className="landing-canvas">
              <div className="landing-artboard">
                <span className="landing-artboard__eyebrow">A CLEARER WAY TO</span>
                <strong>Focus on<br />what matters.</strong>
                <span className="landing-artboard__sub">Your work, beautifully organized.</span>
                <div className="landing-artboard__orb" />
                <div className="landing-artboard__phone">
                  <span className="landing-phone__speaker" />
                  <div className="landing-phone__screen">
                    <div className="landing-phone__top"><i /><i /><i /></div>
                    <div className="landing-phone__headline" />
                    <div className="landing-phone__chart"><i /><i /><i /><i /><i /></div>
                    <div className="landing-phone__card"><i /><span /></div>
                  </div>
                </div>
              </div>
            </div>
            <div className="landing-preview__zoom">Fit&nbsp;&nbsp; 72%</div>
          </div>
          <aside className="landing-preview__inspector" aria-hidden="true">
            <div className="landing-inspector__title">Headline <span>↗</span></div>
            <div className="landing-field-label">CONTENT</div>
            <div className="landing-text-box">Focus on<br />what matters.</div>
            <div className="landing-field-label">LAYOUT</div>
            <div className="landing-field-row"><span>Position</span><b>24, 88</b></div>
            <div className="landing-field-row"><span>Size</span><b>812 × 280</b></div>
            <div className="landing-field-label">TYPE</div>
            <div className="landing-select">Manrope <span>⌄</span></div>
            <div className="landing-color-row"><i /><span>#F8F7FF</span><b>100</b></div>
          </aside>
        </div>
      </div>
      <div className="landing-float landing-float--json" aria-hidden="true">
        <span className="landing-float__icon">{`{ }`}</span>
        <span><b>screenshot-studio.json</b><small>Ready for Git</small></span>
        <CheckIcon />
      </div>
      <div className="landing-float landing-float--export" aria-hidden="true">
        <span className="landing-float__icon landing-float__icon--export">↓</span>
        <span><b>Export complete</b><small>5 PNGs · exact sizes</small></span>
      </div>
    </div>
  )
}

export function LandingPage() {
  return (
    <div className="landing-page">
      <a className="landing-skip-link" href="#main-content">Skip to content</a>
      <header className="landing-header">
        <div className="landing-container landing-header__inner">
          <Brand />
          <nav className="landing-nav" aria-label="Main navigation">
            <a href="#features">Features</a>
            <a href="#workflow">How it works</a>
            <a href="https://github.com/janasco/kami">GitHub</a>
          </nav>
          <a className="landing-button landing-button--small" href={editorHref}>Open editor <ArrowIcon /></a>
        </div>
      </header>

      <main id="main-content">
        <section className="landing-hero">
          <div className="landing-hero__mesh" aria-hidden="true" />
          <div className="landing-container landing-hero__copy">
            <div className="landing-pill"><span>✦</span> The focused App Screenshot Studio</div>
            <h1>Raw captures.<br /><em>Remarkable</em> store screens.</h1>
            <p className="landing-hero__lede">Turn everyday app moments into a polished screenshot suite—without wrestling with a heavyweight design tool.</p>
            <div className="landing-hero__actions">
              <a className="landing-button" href={editorHref}>Create your screenshots <ArrowIcon /></a>
              <a className="landing-button landing-button--secondary" href="#features">See what’s inside</a>
            </div>
            <div className="landing-hero__notes" aria-label="Product benefits">
              <span><CheckIcon /> Works in your browser</span>
              <span><CheckIcon /> Project files stay yours</span>
              <span><CheckIcon /> No design team required</span>
            </div>
          </div>
          <div className="landing-container landing-hero__preview"><EditorPreview /></div>
        </section>

        <section className="landing-proof" aria-label="Supported export profiles">
          <div className="landing-container landing-proof__inner">
            <p>Compose once. Export with the right dimensions.</p>
            <div className="landing-proof__stores">
              <span><i className="landing-store-icon landing-store-icon--apple" /> App Store portraits</span>
              <span><i className="landing-store-icon landing-store-icon--play" /> Google Play phone + tablet</span>
              <span><strong>1242 × 2688</strong> and more</span>
            </div>
          </div>
        </section>

        <section className="landing-intro" id="features">
          <div className="landing-container">
            <div className="landing-section-heading landing-section-heading--center">
              <span className="landing-kicker">A better screenshot workflow</span>
              <h2>From useful captures to<br /><em>scroll-stopping stories.</em></h2>
              <p>Kami handles the presentation layer, so you can stay focused on the product and the message.</p>
            </div>

            <div className="landing-features">
              <article className="landing-feature landing-feature--wide">
                <div className="landing-feature__copy">
                  <FeatureIcon>
                    <svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="4" width="17" height="16" rx="3" stroke="currentColor" strokeWidth="1.7"/><path d="M3.5 9h17M9 9v11" stroke="currentColor" strokeWidth="1.7"/><path d="m13 14 2 2 3-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </FeatureIcon>
                  <span className="landing-feature__number">01</span>
                  <h3>Start with a layout, not a blank canvas.</h3>
                  <p>Choose a general app-store composition, add your capture, and shape the hierarchy with reusable themes and device frames.</p>
                  <ul>
                    <li><CheckIcon /> Hero, centered, and spotlight layouts</li>
                    <li><CheckIcon /> iPhone, Android, or frameless previews</li>
                  </ul>
                </div>
                <div className="landing-layout-demo" aria-hidden="true">
                  <span className="landing-demo-label">LAYOUT</span>
                  <div className="landing-layout-card is-selected"><i className="landing-layout-card__hero" /><b /><b /></div>
                  <div className="landing-layout-card"><i className="landing-layout-card__center" /><b /><b /></div>
                  <div className="landing-layout-card"><i className="landing-layout-card__spot" /><b /><b /></div>
                  <div className="landing-theme-row"><i /><i /><i /><i /></div>
                </div>
              </article>

              <article className="landing-feature landing-feature--violet">
                <FeatureIcon>
                  <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="12" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.7"/><rect x="9" y="3" width="12" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.7"/><path d="m6 16 3-3 2 2 3-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </FeatureIcon>
                <span className="landing-feature__number">02</span>
                <h3>Keep every frame in the same visual flow.</h3>
                <p>Connected panoramic canvases let you compose a cohesive sequence across multiple app screenshots.</p>
                <div className="landing-panorama" aria-hidden="true">
                  <span className="landing-panorama__screen landing-panorama__screen--one"><i /><i /><i /></span>
                  <span className="landing-panorama__connector" />
                  <span className="landing-panorama__screen landing-panorama__screen--two"><i /><i /><i /></span>
                  <span className="landing-panorama__connector" />
                  <span className="landing-panorama__screen landing-panorama__screen--three"><i /><i /><i /></span>
                </div>
              </article>

              <article className="landing-feature landing-feature--peach">
                <FeatureIcon>
                  <svg viewBox="0 0 24 24" fill="none"><ellipse cx="7" cy="6" rx="2.5" ry="2.5" stroke="currentColor" strokeWidth="1.7"/><ellipse cx="7" cy="18" rx="2.5" ry="2.5" stroke="currentColor" strokeWidth="1.7"/><ellipse cx="17" cy="12" rx="2.5" ry="2.5" stroke="currentColor" strokeWidth="1.7"/><path d="M7 8.5v7M9.5 6h2.8a2 2 0 0 1 0 4H9.5m0 0h3a2.5 2.5 0 0 1 0 5H9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
                </FeatureIcon>
                <span className="landing-feature__number">03</span>
                <h3>Version the story, not just the pixels.</h3>
                <p>Save projects as <code>screenshot-studio.json</code>—designed to live alongside your code and move through Git.</p>
                <div className="landing-code-card" aria-hidden="true">
                  <div><i /><i /><i /><span>screenshot-studio.json</span></div>
                  <pre><code><b>{"{"}</b>{'\n'}  <em>"name"</em>: <strong>"App launch"</strong>,{'\n'}  <em>"slides"</em>: [<span>3 slides</span>],{'\n'}  <em>"exportProfile"</em>: <strong>"app-store"</strong>{'\n'}<b>{"}"}</b></code></pre>
                  <div className="landing-code-card__branch"><span>⑂</span> main <i /> Changes ready to commit</div>
                </div>
              </article>

              <article className="landing-feature landing-feature--wide landing-feature--dark">
                <div className="landing-feature__copy">
                  <FeatureIcon>
                    <svg viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0 4-4m-4 4-4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 18v2h14v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                  </FeatureIcon>
                  <span className="landing-feature__number">04</span>
                  <h3>Get every image at the exact profile size.</h3>
                  <p>Export a clean ZIP of PNGs at the dimensions selected for each supported phone and tablet profile.</p>
                  <a href={editorHref}>View export profiles <ArrowIcon /></a>
                </div>
                <div className="landing-export-demo" aria-hidden="true">
                  <div className="landing-export-demo__header"><span>Export slides</span><b>Export ZIP</b></div>
                  <div className="landing-export-profile"><i className="landing-store-icon landing-store-icon--apple" /><span><b>App Store portrait</b><small>PNG · 1242 × 2688</small></span><i className="landing-radio" /></div>
                  <div className="landing-export-profile"><i className="landing-store-icon landing-store-icon--play" /><span><b>Google Play phone</b><small>PNG · 1080 × 1920</small></span><i className="landing-radio is-active" /></div>
                  <div className="landing-export-files"><span>01_launch.png</span><span>02_workflow.png</span><span>03_results.png</span><b>+ 2</b></div>
                </div>
              </article>
            </div>
            <p className="landing-disclaimer">Kami prepares image assets to the selected output dimensions. It does not guarantee App Store or Google Play review approval.</p>
          </div>
        </section>

        <section className="landing-workflow" id="workflow">
          <div className="landing-container">
            <div className="landing-section-heading landing-section-heading--center">
              <span className="landing-kicker">Simple by design</span>
              <h2>From capture to export<br />without the design detour.</h2>
            </div>
            <ol className="landing-steps">
              <li><span>01</span><div className="landing-step-icon">＋</div><h3>Add your capture</h3><p>Import a PNG, JPG, or WebP from your app.</p></li>
              <li><span>02</span><div className="landing-step-icon">▦</div><h3>Build the story</h3><p>Choose a layout and connect the sequence.</p></li>
              <li><span>03</span><div className="landing-step-icon">✦</div><h3>Refine the message</h3><p>Set copy, hierarchy, color, and transforms.</p></li>
              <li><span>04</span><div className="landing-step-icon">↓</div><h3>Export the set</h3><p>Download precise PNGs together in a ZIP.</p></li>
            </ol>
          </div>
        </section>

        <section className="landing-cta">
          <div className="landing-container">
            <div className="landing-cta__card">
              <div className="landing-cta__shape landing-cta__shape--one" />
              <div className="landing-cta__shape landing-cta__shape--two" />
              <span className="landing-kicker">Your next screenshot set starts here</span>
              <h2>Give your app the<br />presentation it deserves.</h2>
              <p>Open the editor and turn your captures into a clear, cohesive app-store story.</p>
              <a className="landing-button landing-button--cream" href={editorHref}>Start creating <ArrowIcon /></a>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container landing-footer__inner">
          <Brand />
          <p>Thoughtful screenshot tools for independent makers.</p>
          <nav aria-label="Footer navigation">
            <a className="landing-button landing-button--quiet" href={editorHref}>Local editor</a>
            <a className="landing-button landing-button--quiet" href="https://github.com/janasco/kami" target="_blank" rel="noreferrer">GitHub ↗</a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
