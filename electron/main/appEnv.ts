import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { app } from 'electron'

export function getSharedDirPath(): string {
  return path.join(os.homedir(), 'ExSharedDIR')
}

export async function ensureDirExists(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
}

export async function getOrCreatePeerId(): Promise<string> {
  const filePath = path.join(app.getPath('userData'), 'peer-id.txt')
  try {
    const existing = (await fs.readFile(filePath, 'utf8')).trim()
    if (existing) return existing
  } catch {
    // ignore
  }
  const generated = `${os.hostname()}-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`
  await ensureDirExists(path.dirname(filePath))
  await fs.writeFile(filePath, generated, 'utf8')
  return generated
}

