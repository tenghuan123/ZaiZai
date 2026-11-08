export async function desktopPages(application) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const view = name => application.windows().find(page => page.url() && new URL(page.url()).searchParams.get('view') === name)
    const pet = view('pet')
    const panel = view('panel')
    if (pet && panel) return { pet, panel }
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('Timed out waiting for the pet and task panel windows')
}
