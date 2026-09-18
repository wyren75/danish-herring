import { useCallback, useEffect, useRef, useState } from 'react'

// Where the README lives, for the foot line on both pages.
const README_URL = 'https://github.com/wyren75/danish-herring#readme'

const CONTACT = 'mfresque@gmail.com'

const STORAGE_KEY = 'welcome-dismissed'

// Shown once per browser (13.10). localStorage may be blocked or full;
// either way the dialog still works, it just shows again next time.
export const welcomeDismissed = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}
const rememberDismissed = () => {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // Storage blocked: nothing to do.
  }
}

// An open book, the glyph of the button that reopens the welcome.
const bookGlyph = (
  <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
    <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M10 5.5 C8.5 4 6 3.5 2.5 4 V15.5 C6 15 8.5 15.5 10 17 Z" />
      <path d="M10 5.5 C11.5 4 14 3.5 17.5 4 V15.5 C14 15 11.5 15.5 10 17 Z" />
      <path d="M10 5.5 V17" />
    </g>
  </svg>
)

interface ButtonProps {
  onClick: () => void
}

// The book icon (13.10): bottom left of the map, same size and style as the
// Layers and Legend icons; reopens the welcome at page 1 any time.
export function AboutButton({ onClick }: ButtonProps) {
  return (
    <button
      type="button"
      className="control-icon about-button"
      title="About Danish Herring"
      aria-label="About Danish Herring"
      onClick={onClick}
    >
      {bookGlyph}
    </button>
  )
}

interface Props {
  open: boolean
  onClose: () => void
}

// The welcome (13.10): a two-page modal centred over a dimmed map. Page 1
// says what this is; page 2 how to find a boat. Esc closes on either page.
// Closing, however it happens, is remembered so the dialog shows once per
// browser; the book icon reopens it at page 1.
export default function Welcome({ open, onClose }: Props) {
  const [page, setPage] = useState<1 | 2>(1)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Reopening always starts at page 1, and focus moves into the dialog so
  // Esc and the buttons are reachable from the keyboard.
  useEffect(() => {
    if (!open) return
    setPage(1)
    dialogRef.current?.focus()
  }, [open])

  const close = useCallback(() => {
    rememberDismissed()
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open) return null

  return (
    <div className="welcome-backdrop">
      <div
        ref={dialogRef}
        className="welcome"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        tabIndex={-1}
      >
        {page === 1 ? (
          <>
            <div className="welcome-head">
              <img src="/herring-painted.png" width="56" height="56" alt="" />
              <div>
                <h1 id="welcome-title">Welcome to Danish Herring!</h1>
                <p className="welcome-tagline">
                  Radar, AIS and a protected sea — a game about finding boats.
                </p>
              </div>
            </div>
            <p>
              Hirsholmene is a scatter of islands off Frederikshavn, on Denmark's Kattegat coast:
              a reserve for seals and seabirds, and a Natura 2000 site protected under European
              law. It is also trawled. That isn't a secret. The designation protects habitats and
              species, but fishing is regulated separately, and for most of Europe's marine sites
              nobody has ever restricted it. Campaigners have a name for this:{' '}
              <em>paper parks</em>. This app takes one of them as its case study — and hands you
              the satellite.
            </p>
            <p>
              It works by crossing three records that were never designed to meet — radar images
              from{' '}
              <a href="https://dataspace.copernicus.eu" target="_blank" rel="noreferrer">
                Copernicus Sentinel-1
              </a>
              , the Danish Maritime Authority's official AIS log, and fishing events classified by{' '}
              <a href="https://globalfishingwatch.org" target="_blank" rel="noreferrer">
                Global Fishing Watch
              </a>{' '}
              — and lets you do something oddly satisfying with them: look at a radar picture,
              spot a bright dot inside the protected boundary, click it, and learn which boat it
              was, what it was doing, and whether anyone had noticed.
            </p>
            <p>
              It's deliberately a game. Geospatial data makes far more sense when you're hunting
              for something — and there is a lot of it here to hunt through.
            </p>
            <p>
              A few honest limits. The satellite passes at fixed hours, so you see the fleet at
              dawn and dusk, never midday. The scenes run from 13 August to 8 September 2026, when
              the fishing was busiest. At ten metres a pixel, small boats don't show. And AIS is
              only what a vessel chooses to declare — which is rather the point.
            </p>
            <div className="welcome-actions">
              <button type="button" className="welcome-button" onClick={() => setPage(2)}>
                How to find a boat? →
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 id="welcome-title">How to find a boat?</h1>
            <p>
              <strong>1 · Pick a moment.</strong> The selector at the top lists fourteen radar
              passes, busiest first. The line beneath says how many fishing vessels were inside
              the site at that exact second.
            </p>
            <p>
              <strong>2 · Look at the radar.</strong> This isn't a photo, and it isn't night: the
              satellite sends its own radar pulse. Calm water bounces it away and shows black; a
              steel hull throws it straight back and shows bright — cloud or no cloud. Zoom into
              the orange boundary and look for white dots.
            </p>
            <p>
              <strong>3 · Click one.</strong> The panel on the right gives its verdict — a name, a
              flag, a length, a speed — or no AIS contact at all, and what that can mean. The
              small gap between the dot and the AIS position is physics, not a bug; hover the (i).
            </p>
            <p>
              <strong>4 · Ask what it was doing.</strong> The Global Fishing Watch section tells
              you whether that boat was fishing at that moment, shortly before or after, and how
              often it has been inside the site.
            </p>
            <p>
              <strong>5 · Check your work.</strong> Open <em>Layers</em> to reveal every AIS
              vessel, show GFW's fishing areas, or switch to the optical photo on a clear day. The{' '}
              <em>Legend</em> explains the symbols.
            </p>
            <p>
              Then visit <strong>Observation</strong> for the bigger question: how often do
              satellites actually look at a protected sea? Here, every 1.7 days. At a World
              Heritage site in West Africa, every 12.
            </p>
            <p>Somewhere in that black water, a boat is waiting to be named. Go and find it!</p>
            <div className="welcome-actions">
              <button
                type="button"
                className="welcome-button welcome-button--quiet"
                onClick={() => setPage(1)}
              >
                ← Back
              </button>
              <button type="button" className="welcome-button" onClick={close}>
                Start
              </button>
            </div>
          </>
        )}
        <div className="welcome-dots" aria-label={`Page ${page} of 2`}>
          <span className={page === 1 ? 'welcome-dot--on' : undefined} />
          <span className={page === 2 ? 'welcome-dot--on' : undefined} />
        </div>
        <p className="welcome-foot">
          Open data · built with AI assistance ·{' '}
          <a href={README_URL} target="_blank" rel="noreferrer">
            about this project
          </a>{' '}
          · questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
        </p>
      </div>
    </div>
  )
}
