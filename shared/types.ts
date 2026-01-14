export type WirePath = string

export type FileKind = 'file' | 'dir'

export interface FileMeta {
  path: WirePath
  kind: FileKind
  size: number
  mtimeMs: number
}

export interface PeerInfo {
  peerId: string
  name: string
  address: string
  httpPort: number
  lastSeen: number
}

export interface RemoteIndex {
  peerId: string
  files: FileMeta[]
  fetchedAt: number
}

export type LibraryStatus = 'downloaded' | 'missing'

export interface LibraryEntry {
  path: WirePath
  kind: FileKind
  size: number
  mtimeMs: number
  status: LibraryStatus
  availablePeerIds: string[]
}

