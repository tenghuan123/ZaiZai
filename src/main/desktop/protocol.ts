import { net, protocol } from 'electron'
import { relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

export const APP_URL = 'buddy-app://ui/index.html'

export function registerRendererProtocol(rendererRoot: string): void {
  protocol.handle('buddy-app', async request => {
    try {
      const url = new URL(request.url)
      if (request.method !== 'GET' || url.host !== 'ui') return new Response('Not found', { status: 404 })
      const path = resolve(rendererRoot, `.${decodeURIComponent(url.pathname)}`)
      const local = relative(rendererRoot, path)
      if (local.startsWith(`..${sep}`) || local === '..' || !local) return new Response('Not found', { status: 404 })
      const response = await net.fetch(pathToFileURL(path).href)
      const headers = new Headers(response.headers)
      headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'")
      return new Response(response.body, { status: response.status, headers })
    } catch { return new Response('Not found', { status: 404 }) }
  })
}
