import { app, BrowserWindow } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { ensureDirExists, getOrCreatePeerId, getSharedDirPath } from './appEnv'
import { scanSharedDir, resolveWirePathSafe } from './sharedIndex'
import { startFileServer } from './httpServer'
import { startDiscovery } from './discovery'
import { registerIpc } from './ipc'
import type { FileMeta, PeerInfo, RemoteIndex } from '../../shared/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    icon: path.join(process.env.VITE_PUBLIC!, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (VITE_DEV_SERVER_URL) win.loadURL(VITE_DEV_SERVER_URL)
  else win.loadFile(path.join(RENDERER_DIST, 'index.html'))
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.whenReady().then(async () => {
  createWindow()
  if (!win) return

  const sharedDir = getSharedDirPath()
  await ensureDirExists(sharedDir)

  const peerId = await getOrCreatePeerId()

  let localIndexCache: { at: number; files: FileMeta[] } | null = null
  let lastLocalIndexFingerprint: string | null = null
  const getLocalIndex = async (): Promise<FileMeta[]> => {
    const now = Date.now()
    if (localIndexCache && now - localIndexCache.at < 1200) return localIndexCache.files
    const files = await scanSharedDir(sharedDir)
    localIndexCache = { at: now, files }
    return files
  }

  const fileServer = await startFileServer({
    sharedDir,
    getPeerId: () => peerId,
    getLocalIndex,
  })

  const remoteIndexes = new Map<string, RemoteIndex>()
  let currentPeers: PeerInfo[] = []

  const discovery = await startDiscovery({
    peerId,
    httpPort: fileServer.port,
    hasLocalFile: async wirePath => {
      try {
        const abs = resolveWirePathSafe(sharedDir, wirePath)
        const st = await (await import('node:fs/promises')).stat(abs)
        return st.isFile()
      } catch {
        return false
      }
    },
    onPeersUpdated: peers => {
      currentPeers = peers
      const alive = new Set(peers.map(p => p.peerId))
      for (const key of remoteIndexes.keys()) {
        if (!alive.has(key)) remoteIndexes.delete(key)
      }
      win?.webContents.send('peers:updated', peers)
    },
    onRemoteIndexUpdated: remoteIndex => {
      remoteIndexes.set(remoteIndex.peerId, remoteIndex)
      win?.webContents.send('remoteIndex:updated', remoteIndex)
    },
    getRemoteIndexUrl: peer => `http://${peer.address}:${peer.httpPort}/index`,
  })

  registerIpc(win, {
    sharedDir,
    getPeerId: () => peerId,
    getHttpPort: () => fileServer.port,
    getPeers: () => currentPeers,
    getLocalIndex,
    getRemoteIndexes: () => [...remoteIndexes.values()],
    requestFileOffers: discovery.requestFileOffers,
  })

  const localScanTimer = setInterval(async () => {
    const files = await scanSharedDir(sharedDir).catch(() => null)
    if (!files) return
    const fingerprint = JSON.stringify(files)
    if (fingerprint === lastLocalIndexFingerprint) return
    lastLocalIndexFingerprint = fingerprint
    localIndexCache = { at: Date.now(), files }
    win?.webContents.send('files:updated', files)
  }, 2500)

  app.on('will-quit', async () => {
    clearInterval(localScanTimer)
    await discovery.close().catch(() => {})
    await fileServer.close().catch(() => {})
  })
})
