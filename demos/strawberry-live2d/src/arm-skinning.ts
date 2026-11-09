interface Drawables {
  ids: readonly string[]
  vertexPositions: readonly Float32Array[]
}

interface ArmMesh {
  index: number
  neutral: Float32Array
  output: Float32Array
  forearmWeights: number[]
  reference: [number, number]
}

interface Arm {
  upper: ArmMesh
  forearm: ArmMesh
  meshes: ArmMesh[]
}

/** Soften the cut between two rigid Cubism parts without changing Core's buffers.
 * Both sides use the same blend field, so their cut edges follow one another.
 * The original shoulder, wrist, opacity and draw order still come from the MOC3.
 */
export class ArmSkinning {
  private arms: Arm[]

  constructor(private drawables: Drawables) {
    this.arms = (['L', 'R'] as const).map(side => {
      const direction = side === 'L' ? 1 : -1
      const elbowX = side === 'L' ? 191 : 129
      const meshes = ['UpperArm', 'Forearm', 'ElbowUnderlap'].map(name => {
        const index = drawables.ids.indexOf(name + side)
        if (index < 0) throw new Error(`缺少肘部柔化网格：${name}${side}`)
        const neutral = drawables.vertexPositions[index].slice()
        const forearmWeights = []
        for (let vertex = 0; vertex < neutral.length; vertex += 2) {
          const x = (neutral[vertex] + .5) * 320
          const y = (.5 - neutral[vertex + 1]) * 320
          // Match the source-art cut plane. Limit skinning to seven source pixels
          // on either side, keeping the sleeve and wrist outside the bend zone.
          const distance = (direction * 10 * (x - elbowX) + 12 * (y - 190)) / Math.hypot(10, 12)
          const blend = Math.max(0, Math.min(1, (distance + 7) / 14))
          // The tiny cap follows the joint bisector as one piece. A varying
          // field across its coarse five-vertex fan can fold at a deep bend.
          forearmWeights.push(name === 'ElbowUnderlap' ? .5 : blend * blend * (3 - 2 * blend))
        }
        return { index, neutral, output: new Float32Array(neutral.length), forearmWeights, reference: referenceEdge(neutral) }
      })
      return { upper: meshes[0], forearm: meshes[1], meshes }
    })
  }

  vertices(index: number): Float32Array {
    const original = this.drawables.vertexPositions[index]
    const arm = this.arms.find(arm => arm.meshes.some(mesh => mesh.index === index))
    if (!arm) return original
    const upper = rigidTransform(arm.upper, this.drawables.vertexPositions[arm.upper.index])
    const forearm = rigidTransform(arm.forearm, this.drawables.vertexPositions[arm.forearm.index])
    // Preserve Core's exact output at rest and during shoulder-only movement.
    if (Math.abs(upper.a - forearm.a) + Math.abs(upper.b - forearm.b) < .00001) return original
    const mesh = arm.meshes.find(mesh => mesh.index === index)!
    for (let vertex = 0; vertex < mesh.neutral.length; vertex += 2) {
      const x = mesh.neutral[vertex], y = mesh.neutral[vertex + 1]
      const weight = mesh.forearmWeights[vertex / 2]
      const ux = upper.a * x - upper.b * y + upper.x
      const uy = upper.b * x + upper.a * y + upper.y
      const fx = forearm.a * x - forearm.b * y + forearm.x
      const fy = forearm.b * x + forearm.a * y + forearm.y
      mesh.output[vertex] = ux + (fx - ux) * weight
      mesh.output[vertex + 1] = uy + (fy - uy) * weight
    }
    return mesh.output
  }
}

function referenceEdge(neutral: Float32Array): [number, number] {
  // Use the most widely separated pair to avoid amplifying subpixel rounding.
  let first = 0, second = 2, longest = 0
  for (let i = 0; i < neutral.length; i += 2) for (let j = i + 2; j < neutral.length; j += 2) {
    const distance = (neutral[j] - neutral[i]) ** 2 + (neutral[j + 1] - neutral[i + 1]) ** 2
    if (distance > longest) { first = i; second = j; longest = distance }
  }
  if (!longest) throw new Error('肘部柔化网格没有有效的参考边。')
  return [first, second]
}

function rigidTransform(mesh: ArmMesh, current: Float32Array) {
  const { neutral, reference: [first, second] } = mesh
  const dx = neutral[second] - neutral[first], dy = neutral[second + 1] - neutral[first + 1]
  const longest = dx * dx + dy * dy
  const px = current[second] - current[first], py = current[second + 1] - current[first + 1]
  const a = (px * dx + py * dy) / longest, b = (py * dx - px * dy) / longest
  return { a, b, x: current[first] - a * neutral[first] + b * neutral[first + 1], y: current[first + 1] - b * neutral[first] - a * neutral[first + 1] }
}
