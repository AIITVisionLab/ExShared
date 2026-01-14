import fs from 'node:fs/promises'
import path from 'node:path'
import type { FileKind, FileMeta, WirePath } from '../../shared/types'

function toWirePath(relativeFsPath: string): WirePath {
  return relativeFsPath.split(path.sep).join('/')
}

export function fromWirePath(wirePath: WirePath): string {
  return wirePath.split('/').join(path.sep)
}

export function resolveWirePathSafe(sharedDir: string, wirePath: WirePath): string {
  const normalized = wirePath.replace(/^\/+/, '')
  const candidate = path.resolve(sharedDir, fromWirePath(normalized))
  const rel = path.relative(sharedDir, candidate)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Invalid path')
  }
  return candidate
}

export async function scanSharedDir(sharedDir: string): Promise<FileMeta[]> {
  const results: FileMeta[] = []
  const stack: Array<{ absPath: string; relPath: string }> = [{ absPath: sharedDir, relPath: '' }]

  while (stack.length) {
    const current = stack.pop()!
    let entries: Array<import('node:fs').Dirent>
    try {
      entries = await fs.readdir(current.absPath, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (entry.name === '.DS_Store') continue

      const abs = path.join(current.absPath, entry.name)
      const rel = current.relPath ? path.join(current.relPath, entry.name) : entry.name
      const wirePath = toWirePath(rel)

      let stat: import('node:fs').Stats
      try {
        stat = await fs.stat(abs)
      } catch {
        continue
      }

      const kind: FileKind = entry.isDirectory() ? 'dir' : 'file'
      results.push({
        path: wirePath,
        kind,
        size: kind === 'file' ? stat.size : 0,
        mtimeMs: stat.mtimeMs,
      })

      if (entry.isDirectory()) {
        stack.push({ absPath: abs, relPath: rel })
      }
    }
  }

  results.sort((a, b) => a.path.localeCompare(b.path))
  return results
}
