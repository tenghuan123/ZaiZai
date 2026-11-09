import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ArmSkinning } from '../src/arm-skinning.ts'

const point = (x, y) => [x / 320 - .5, .5 - y / 320]
function fixture() {
  const ids = [], vertexPositions = []
  for (const side of ['L', 'R']) for (const name of ['UpperArm', 'Forearm', 'ElbowUnderlap', 'Hand']) {
    ids.push(name + side)
    // Each mesh shares a point on the source cut, and extends beyond the bend.
    const points = [[191, 190], [186, 172], [204, 205]]
    vertexPositions.push(new Float32Array(points.flatMap(([x, y]) => point(side === 'L' ? x : 320 - x, y))))
  }
  return { ids, vertexPositions }
}

function rotate(points, degrees, pivot = point(191, 190)) {
  const a = Math.cos(degrees * Math.PI / 180), b = Math.sin(degrees * Math.PI / 180)
  return new Float32Array(Array.from(points, (value, i) => {
    const at = i - i % 2, x = points[at] - pivot[0], y = points[at + 1] - pivot[1]
    return i % 2 ? pivot[1] + b * x + a * y : pivot[0] + a * x - b * y
  }))
}

const close = (actual, expected, label) => actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < .000001, label))

test('neutral and shoulder-only movement preserve the exact Core vertex buffers', () => {
  const core = fixture(), skinning = new ArmSkinning(core)
  for (let i = 0; i < core.ids.length; i++) assert.equal(skinning.vertices(i), core.vertexPositions[i])
  core.vertexPositions = core.vertexPositions.map(points => rotate(points, 42))
  for (let i = 0; i < core.ids.length; i++) assert.equal(skinning.vertices(i), core.vertexPositions[i])
})

test('both edges meet throughout the bend while the sleeve, wrist and opposite arm remain stable', () => {
  for (const side of ['L', 'R']) for (const degrees of [15, 45, 70, 95]) {
    const core = fixture(), skinning = new ArmSkinning(core)
    const upper = core.ids.indexOf('UpperArm' + side), forearm = core.ids.indexOf('Forearm' + side)
    const patch = core.ids.indexOf('ElbowUnderlap' + side), hand = core.ids.indexOf('Hand' + side)
    core.vertexPositions[forearm] = rotate(core.vertexPositions[forearm], side === 'L' ? degrees : -degrees, point(side === 'L' ? 191 : 129, 190))
    const untouched = core.vertexPositions.map(points => points.slice())
    close(skinning.vertices(upper).slice(0, 2), skinning.vertices(forearm).slice(0, 2), 'cut edges separated')
    close(skinning.vertices(upper).slice(0, 2), skinning.vertices(patch).slice(0, 2), 'backing separated')
    close(skinning.vertices(upper).slice(2, 4), untouched[upper].slice(2, 4), 'sleeve moved')
    close(skinning.vertices(forearm).slice(4, 6), untouched[forearm].slice(4, 6), 'wrist moved')
    assert.equal(skinning.vertices(hand), core.vertexPositions[hand])
    for (let i = 0; i < core.ids.length; i++) {
      if (!core.ids[i].endsWith(side)) assert.equal(skinning.vertices(i), core.vertexPositions[i])
      close(core.vertexPositions[i], untouched[i], 'Core memory was mutated')
    }
    const first = skinning.vertices(upper).slice()
    for (let i = 0; i < 120; i++) close(skinning.vertices(upper), first, 'deformation accumulated')
    core.vertexPositions[forearm] = fixture().vertexPositions[forearm]
    assert.equal(skinning.vertices(upper), core.vertexPositions[upper])
  }
})

test('bending follows an independent shoulder transform without changing the bend shape', () => {
  const core = fixture(), skinning = new ArmSkinning(core)
  core.vertexPositions[1] = rotate(core.vertexPositions[1], 80)
  const bent = [0, 1, 2].map(index => skinning.vertices(index).slice())
  core.vertexPositions = core.vertexPositions.map(points => rotate(points, 35))
  for (const index of [0, 1, 2]) close(skinning.vertices(index), rotate(bent[index], 35), 'shoulder composition changed the bend')
})
