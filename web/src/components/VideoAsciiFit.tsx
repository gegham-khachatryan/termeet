import { useLayoutEffect, useRef, type ReactNode } from "react"

/**
 * Scales monospace ASCII content to fill the tile (letterboxed via uniform scale).
 */
export function VideoAsciiFit({ children }: { children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const outer = outerRef.current
    const layer = layerRef.current
    if (!outer || !layer) return

    const update = () => {
      const ow = outer.clientWidth
      const oh = outer.clientHeight
      if (ow < 2 || oh < 2) return
      const iw = Math.max(layer.offsetWidth, 1)
      const ih = Math.max(layer.offsetHeight, 1)
      const s = Math.min(ow / iw, oh / ih)
      layer.style.transform = `translate(-50%, -50%) scale(${s})`
    }

    const ro = new ResizeObserver(update)
    ro.observe(outer)
    ro.observe(layer)
    update()

    return () => ro.disconnect()
  }, [])

  return (
    <div ref={outerRef} className="video-feed-fit">
      <div ref={layerRef} className="video-feed-fit__layer">
        {children}
      </div>
    </div>
  )
}
