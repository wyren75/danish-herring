import { useMemo } from 'react'
import type { SiteGeometry } from '../lib/geo'

const SIZE = 96
const PAD = 6

// A tiny outline of the site (11.1, item 1): equirectangular, longitude
// scaled by cos(latitude) so the shape is not stretched, fitted to the box.
export default function Inset({ geometry, label }: { geometry: SiteGeometry; label: string }) {
  const d = useMemo(() => {
    const rings = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates).map(
      (polygon) => polygon[0],
    )
    const lats = rings.flat().map(([, lat]) => lat)
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2
    const kx = Math.cos((midLat * Math.PI) / 180)
    const xs = rings.flat().map(([lon]) => lon * kx)
    const minX = Math.min(...xs)
    const minLat = Math.min(...lats)
    const scale = (SIZE - 2 * PAD) / Math.max(Math.max(...xs) - minX, Math.max(...lats) - minLat)
    const w = (Math.max(...xs) - minX) * scale
    const h = (Math.max(...lats) - minLat) * scale
    const ox = (SIZE - w) / 2
    const oy = (SIZE - h) / 2
    return rings
      .map(
        (ring) =>
          ring
            .map(([lon, lat], i) => {
              const x = ox + (lon * kx - minX) * scale
              const y = oy + h - (lat - minLat) * scale
              return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
            })
            .join(' ') + ' Z',
      )
      .join(' ')
  }, [geometry])

  return (
    <svg className="inset" width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={label}>
      <path d={d} />
    </svg>
  )
}
