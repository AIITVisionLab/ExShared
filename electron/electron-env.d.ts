/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
  api: {
    getInfo: () => Promise<{ peerId: string; sharedDir: string; httpPort: number }>
    getLocalFiles: () => Promise<import('../shared/types').FileMeta[]>
    getPeers: () => Promise<import('../shared/types').PeerInfo[]>
    getLibrary: () => Promise<import('../shared/types').LibraryEntry[]>
    refresh: () => Promise<import('../shared/types').FileMeta[]>
    download: (wirePath: string) => Promise<{ ok: boolean; fromPeerId?: string; error?: string }>
    onPeersUpdated: (cb: (peers: import('../shared/types').PeerInfo[]) => void) => void
    onFilesUpdated: (cb: (files: import('../shared/types').FileMeta[]) => void) => void
    onRemoteIndexUpdated: (cb: (idx: import('../shared/types').RemoteIndex) => void) => void
  }
}
