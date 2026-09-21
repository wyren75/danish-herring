// The progress counter (SPEC.md 13.14): how many of the scene's in-site
// fishing vessels the user has found, floating at the top of the map.
import { useEffect, useRef, useState } from 'react'

const TIP = 'Fishing vessels inside the protected site that you have identified.'

interface Props {
  found: number // distinct MMSIs matched in this scene, Fishing and in site
  total: number // the scene's n_fishing_in_site — the same two conditions
}

// Hidden entirely on a scene with nothing to find: an empty quest is worse
// than no quest. Muted until the first find, so it reads as a target rather
// than a score; full strength once the hunt has started.
export default function Progress({ found, total }: Props) {
  // Remounting the count restarts the pulse, so each increment is seen.
  const [pulse, setPulse] = useState(0)
  const previous = useRef(found)
  useEffect(() => {
    if (found > previous.current) setPulse((p) => p + 1)
    previous.current = found
  }, [found])

  if (total <= 0) return null
  const all = found >= total

  return (
    <div
      className={`progress${found > 0 ? ' progress--found' : ''}${all ? ' progress--all' : ''}`}
      title={TIP}
      aria-live="polite"
    >
      <img
        className="progress-icon"
        src="/trawler-flat.png"
        srcSet="/trawler-flat.png 1x, /trawler-flat@2x.png 2x"
        width={40}
        height={40}
        alt=""
      />
      <span key={pulse} className="progress-count">
        {found} / {total}
        {all && <span className="progress-all"> · all found</span>}
      </span>
    </div>
  )
}
