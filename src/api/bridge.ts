import type { FileMeta, LibraryEntry, PeerInfo, RemoteIndex } from '../../shared/types'

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

function requireApi() {
  if (!window.api) {
    throw new Error('window.api is not available. Start the app via Electron (preload) and rebuild after changing preload code.')
  }
  return window.api
}

export const bridge = {
  getInfo: () => requireApi().getInfo() as Promise<AppInfo>,
  getLocalFiles: () => requireApi().getLocalFiles() as Promise<FileMeta[]>,
  getPeers: () => requireApi().getPeers() as Promise<PeerInfo[]>,
  getLibrary: () => requireApi().getLibrary() as Promise<LibraryEntry[]>,
  refresh: () => requireApi().refresh() as Promise<FileMeta[]>,
  download: (wirePath: string) => requireApi().download(wirePath) as Promise<DownloadResult>,
  onPeersUpdated: (cb: (peers: PeerInfo[]) => void) => requireApi().onPeersUpdated(cb),
  onFilesUpdated: (cb: (files: FileMeta[]) => void) => requireApi().onFilesUpdated(cb),
  onRemoteIndexUpdated: (cb: (idx: RemoteIndex) => void) => requireApi().onRemoteIndexUpdated(cb),
}
