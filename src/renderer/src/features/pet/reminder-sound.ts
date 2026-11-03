let context: AudioContext | undefined
export async function playReminderBell(): Promise<void> {
  context ??= new AudioContext()
  if (context.state === 'suspended') await context.resume()
  const now = context.currentTime
  const notes = [
    { frequency: 1318.5, delay: 0, duration: .28, gain: .18 },
    { frequency: 1760, delay: .14, duration: .30, gain: .20 },
    { frequency: 1318.5, delay: .28, duration: .26, gain: .16 },
    { frequency: 2093, delay: .42, duration: .55, gain: .22 }
  ]
  for (const note of notes) for (const harmonic of [1, 2]) {
    const oscillator = context.createOscillator(), gain = context.createGain()
    const start = now + note.delay, end = start + note.duration * (harmonic === 1 ? 1 : .65)
    oscillator.type = harmonic === 1 ? 'sine' : 'triangle'
    oscillator.frequency.setValueAtTime(note.frequency * harmonic, start)
    gain.gain.setValueAtTime(.001, start)
    gain.gain.linearRampToValueAtTime(note.gain * (harmonic === 1 ? 1 : .3), start + .015)
    gain.gain.exponentialRampToValueAtTime(.0005, end)
    oscillator.connect(gain); gain.connect(context.destination)
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
    oscillator.start(start); oscillator.stop(end + .02)
  }
}
