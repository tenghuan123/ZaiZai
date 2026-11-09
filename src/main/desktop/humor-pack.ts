import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import defaultPack from '../../../resources/humor/desk-break.json'
import type { HumorContent, HumorKind } from '../../shared/humor'

function parseContent(pack: unknown): HumorContent {
  if (!pack || typeof pack !== 'object' || !('formatVersion' in pack) || pack.formatVersion !== 1 ||
    !('entries' in pack) || !Array.isArray(pack.entries) || pack.entries.length > 120) {
    throw new Error('需要 formatVersion 为 1 且最多含 120 条内容的资源包。')
  }
  const content: Record<HumorKind, Set<string>> = { joke: new Set(), roast: new Set() }
  for (const entry of pack.entries as unknown[]) {
    if (!entry || typeof entry !== 'object' || !('kind' in entry) || (entry.kind !== 'joke' && entry.kind !== 'roast') ||
      !('text' in entry) || typeof entry.text !== 'string') throw new Error('条目需要有效的 kind 和 text。')
    const text = entry.text.trim()
    if (!text || text.length > 80) throw new Error('每条文案需要包含 1～80 个字符。')
    content[entry.kind].add(text)
  }
  if (!content.joke.size || !content.roast.size) throw new Error('资源包至少需要一条笑话和一条毒鸡汤。')
  return { joke: [...content.joke], roast: [...content.roast] }
}

export function loadHumorContent(dataPath: string, onInvalid: (error: unknown) => void): HumorContent {
  const path = join(dataPath, 'humor-pack.json')
  try {
    const file = statSync(path, { throwIfNoEntry: false })
    if (file) {
      if (!file.isFile() || file.size > 128 * 1024) throw new Error('需要不超过 128 KB 的 JSON 文件。')
      const raw = readFileSync(path, 'utf8').replace(/^\uFEFF/, '')
      return parseContent(JSON.parse(raw))
    }
  } catch (error) {
    onInvalid(error)
  }
  return parseContent(defaultPack)
}
