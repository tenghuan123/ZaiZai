export function drawHumorLine(lines: readonly string[], draw: number, previous?: string): string {
  const previousIndex = previous === undefined ? -1 : lines.indexOf(previous)
  if (previousIndex < 0 || lines.length === 1) return lines[Math.floor(draw * lines.length)]
  const index = Math.floor(draw * (lines.length - 1))
  return lines[index < previousIndex ? index : index + 1]
}
