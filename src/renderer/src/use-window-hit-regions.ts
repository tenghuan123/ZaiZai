import { useLayoutEffect } from 'react'
import type { HitRegion } from '../../shared/window'

function measure(element: HTMLElement): HitRegion {
  // Use layout bounds so the hit area does not move with a bubble's entrance animation.
  let x = 0, y = 0
  for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.offsetParent as HTMLElement | null) {
    x += ancestor.offsetLeft
    y += ancestor.offsetTop
  }
  const radius = Number.parseFloat(getComputedStyle(element).borderTopLeftRadius)
  return { x, y, width: element.offsetWidth, height: element.offsetHeight, radius: Number.isFinite(radius) ? radius : 0 }
}

export function useWindowHitRegions(): void {
  useLayoutEffect(() => {
    const root = document.getElementById('root')!
    let frame = 0
    let last = ''
    function publish(): void {
      frame = 0
      // A modal's backdrop is interactive across the native window.
      const regions = root.querySelector('dialog[open]')
        ? [{ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight, radius: 0 }]
        : [...root.querySelectorAll<HTMLElement>('[data-window-hit]')]
          .filter(element => !element.closest('[inert]') && element.getClientRects().length)
          .map(measure).filter(region => region.width > 0 && region.height > 0)
      const key = JSON.stringify(regions)
      if (key === last) return
      last = key
      window.desktop.setHitRegions(regions)
    }
    function schedule(): void { if (!frame) frame = requestAnimationFrame(publish) }
    const observer = new MutationObserver(schedule)
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['open', 'inert', 'hidden', 'class', 'style', 'data-horizontal', 'data-vertical'] })
    window.addEventListener('resize', schedule)
    publish()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
    }
  }, [])
}
