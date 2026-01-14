import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import type { FileMeta, LibraryEntry, PeerInfo, RemoteIndex } from '../../shared/types'
import { scanSharedDir } from './sharedIndex'
import { resolveWirePathSafe } from './sharedIndex'

export interface IpcDeps {
  sharedDir: string
  getPeerId: () => string
  getHttpPort: () => number
  getPeers: () => PeerInfo[]
  getLocalIndex: () => Promise<FileMeta[]>
  getRemoteIndexes: () => RemoteIndex[]
  requestFileOffers: (wirePath: string) => Promise<PeerInfo[]>
}

function mergeLibrary(local: FileMeta[], remotes: RemoteIndex[]): LibraryEntry[] {
  const localMap = new Map(local.map(f => [f.path, f]))
  const available = new Map<string, Set<string>>()
  for (const remote of remotes) {
    for (const f of remote.files) {
      let set = available.get(f.path)
      if (!set) {
        set = new Set()
        available.set(f.path, set)
      }
      set.add(remote.peerId)
    }
  }

  const paths = new Set<string>([...localMap.keys(), ...available.keys()])
  const merged: LibraryEntry[] = []
  for (const p of paths) {
    const l = localMap.get(p)
    const peers = [...(available.get(p) ?? new Set())]
    if (l) {
      merged.push({
        path: p,
        kind: l.kind,
        size: l.size,
        mtimeMs: l.mtimeMs,
        status: 'downloaded',
        availablePeerIds: peers,
      })
    } else {
      // pick meta from any remote
      const anyRemote = remotes.find(r => r.files.some(f => f.path === p))?.files.find(f => f.path === p)
      merged.push({
        path: p,
        kind: anyRemote?.kind ?? 'file',
        size: anyRemote?.size ?? 0,
        mtimeMs: anyRemote?.mtimeMs ?? 0,
        status: 'missing',
        availablePeerIds: peers,
      })
    }
  }

  merged.sort((a, b) => a.path.localeCompare(b.path))
  return merged
}

function downloadFromPeer(sharedDir: string, peer: PeerInfo, wirePath: string): Promise<void> {
  const url = `http://${peer.address}:${peer.httpPort}/file?path=${encodeURIComponent(wirePath)}`
  return new Promise<void>((resolve, reject) => {
    const req = http.get(url, res => {
      ;(async () => {
        if (!res.statusCode || res.statusCode >= 400) {
          throw new Error(`HTTP ${res.statusCode ?? 'ERR'}`)
        }

        const targetAbs = resolveWirePathSafe(sharedDir, wirePath)
        await fs.mkdir(path.dirname(targetAbs), { recursive: true })

        const tmpAbs = `${targetAbs}.part-${Date.now().toString(16)}`
        await pipeline(res, createWriteStream(tmpAbs))
        await fs.rename(tmpAbs, targetAbs)
      })()
        .then(resolve)
        .catch(err => {
          res.resume()
          reject(err)
        })
    })
    req.on('error', reject)
  })
}

export function registerIpc(win: BrowserWindow, deps: IpcDeps): void {
  const notify = (channel: string, payload: unknown) => win.webContents.send(channel, payload)

  ipcMain.handle('app:getInfo', () => ({
    peerId: deps.getPeerId(),
    sharedDir: deps.sharedDir,
    httpPort: deps.getHttpPort(),
  }))

  ipcMain.handle('shared:getLocalFiles', () => deps.getLocalIndex())
  ipcMain.handle('peers:getPeers', () => deps.getPeers())
  ipcMain.handle('shared:getLibrary', async () => mergeLibrary(await deps.getLocalIndex(), deps.getRemoteIndexes()))

  ipcMain.handle('shared:download', async (_evt, wirePath: string) => {
    const offers = await deps.requestFileOffers(wirePath)
    if (!offers.length) return { ok: false, error: 'no peers available' }

    for (const peer of offers) {
      try {
        await downloadFromPeer(deps.sharedDir, peer, wirePath)
        notify('files:updated', await deps.getLocalIndex())
        return { ok: true, fromPeerId: peer.peerId }
      } catch {
        // try next offer
      }
    }
    return { ok: false, error: 'download failed' }
  })

  ipcMain.handle('shared:refresh', async () => {
    const files = await scanSharedDir(deps.sharedDir)
    notify('files:updated', files)
    return files
  })
}
