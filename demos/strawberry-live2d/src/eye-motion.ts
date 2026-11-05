export type EyeFrame = 0 | 0.5 | 1

/** This model has three painted eye frames; intermediate MOC values ghost the open iris. */
export function resolveEyeFrame(openness: number, blink = 1): EyeFrame {
  const value = openness * blink
  return value <= 0.25 ? 0 : value < 0.75 ? 0.5 : 1
}

export function blinkOpenness(seconds: number): number {
  const phase = seconds % 4.3
  const start = 4.02
  if (phase < start) return 1
  const elapsed = phase - start
  const ease = (value: number): number => value * value * (3 - 2 * value)
  if (elapsed < 0.08) return 1 - ease(elapsed / 0.08)
  if (elapsed < 0.15) return 0
  return ease(Math.min(1, (elapsed - 0.15) / 0.13))
}
