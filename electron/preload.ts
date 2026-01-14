import { contextBridge, ipcRenderer } from 'electron'
import type { FileMeta, LibraryEntry, PeerInfo, RemoteIndex } from '../shared/types'

export interface AppInfo {
  peerId: string
  sharedDir: string
  httpPort: number
}

export interface DownloadResult {
  ok: boolean
  fromPeerId?: string
  error?: string
}

const api = {
  getInfo: () => ipcRenderer.invoke('app:getInfo') as Promise<AppInfo>,
  getLocalFiles: () => ipcRenderer.invoke('shared:getLocalFiles') as Promise<FileMeta[]>,
  getPeers: () => ipcRenderer.invoke('peers:getPeers') as Promise<PeerInfo[]>,
  getLibrary: () => ipcRenderer.invoke('shared:getLibrary') as Promise<LibraryEntry[]>,
  refresh: () => ipcRenderer.invoke('shared:refresh') as Promise<FileMeta[]>,
  download: (wirePath: string) => ipcRenderer.invoke('shared:download', wirePath) as Promise<DownloadResult>,
  onPeersUpdated: (cb: (peers: PeerInfo[]) => void) => ipcRenderer.on('peers:updated', (_e, p) => cb(p)),
  onFilesUpdated: (cb: (files: FileMeta[]) => void) => ipcRenderer.on('files:updated', (_e, f) => cb(f)),
  onRemoteIndexUpdated: (cb: (idx: RemoteIndex) => void) => ipcRenderer.on('remoteIndex:updated', (_e, i) => cb(i)),
}

contextBridge.exposeInMainWorld('api', api)

