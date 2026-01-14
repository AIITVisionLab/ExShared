import dgram from 'node:dgram'
import os from 'node:os'
import http from 'node:http'
import type { PeerInfo, RemoteIndex } from '../../shared/types'
import {
  decodeDiscoveryMessage,
  encodeDiscoveryMessage,
  type FileOfferMessage,
  type FileRequestMessage,
  type HelloMessage,
} from '../../shared/protocol'
import {
  DISCOVERY_ANNOUNCE_INTERVAL_MS,
  DISCOVERY_PORT,
  PEER_STALE_AFTER_MS,
} from '../../shared/constants'

export interface DiscoveryDeps {
  peerId: string
  httpPort: number
  hasLocalFile: (wirePath: string) => Promise<boolean>
  onPeersUpdated: (peers: PeerInfo[]) => void
  onRemoteIndexUpdated: (remoteIndex: RemoteIndex) => void
  getRemoteIndexUrl: (peer: PeerInfo) => string
}

export interface DiscoveryHandle {
  close: () => Promise<void>
  requestFileOffers: (wirePath: string, timeoutMs?: number) => Promise<PeerInfo[]>
  getPeers: () => PeerInfo[]
}

function broadcastAddresses(): string[] {
  const addresses = new Set<string>()
  addresses.add('255.255.255.255')

  const nets = os.networkInterfaces()
  for (const key of Object.keys(nets)) {
    for (const net of nets[key] ?? []) {
      if (net.family !== 'IPv4') continue
      if (net.internal) continue
      const parts = net.address.split('.')
      if (parts.length !== 4) continue
      parts[3] = '255'
      addresses.add(parts.join('.'))
    }
  }
  return [...addresses]
}

function fetchJson<T>(url: string, timeoutMs = 2500): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const req = http.get(url, res => {
      if (!res.statusCode || res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode ?? 'ERR'}`))
        res.resume()
        return
      }
      const chunks: Buffer[] = []
      res.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as T)
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')))
  })
}

export async function startDiscovery(deps: DiscoveryDeps): Promise<DiscoveryHandle> {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

  const peers = new Map<string, PeerInfo>()
  const lastIndexFetchAt = new Map<string, number>()
  const pendingOffers = new Map<
    string,
    { targetPath: string; offers: Map<string, PeerInfo>; done: (peers: PeerInfo[]) => void }
  >()

  const announce = () => {
    const message: HelloMessage = {
      type: 'HELLO',
      peerId: deps.peerId,
      name: os.hostname(),
      httpPort: deps.httpPort,
      ts: Date.now(),
    }
    const buf = encodeDiscoveryMessage(message)
    for (const addr of broadcastAddresses()) {
      socket.send(buf, 0, buf.length, DISCOVERY_PORT, addr)
    }
  }

  const sweep = () => {
    const now = Date.now()
    let changed = false
    for (const [peerId, peer] of peers.entries()) {
      if (now - peer.lastSeen > PEER_STALE_AFTER_MS) {
        peers.delete(peerId)
        changed = true
      }
    }
    if (changed) deps.onPeersUpdated([...peers.values()].sort((a, b) => a.name.localeCompare(b.name)))
  }

  socket.on('message', async (data, rinfo) => {
    const msg = decodeDiscoveryMessage(data)
    if (!msg) return

    if (msg.type === 'HELLO') {
      if (msg.peerId === deps.peerId) return
      const existing = peers.get(msg.peerId)
      const next: PeerInfo = {
        peerId: msg.peerId,
        name: msg.name,
        address: rinfo.address,
        httpPort: msg.httpPort,
        lastSeen: Date.now(),
      }
      peers.set(msg.peerId, next)

      const changed = !existing || existing.address !== next.address || existing.httpPort !== next.httpPort
      deps.onPeersUpdated([...peers.values()].sort((a, b) => a.name.localeCompare(b.name)))

      const now = Date.now()
      const lastFetch = lastIndexFetchAt.get(next.peerId) ?? 0
      const shouldFetch = changed || now - lastFetch > 6000
      if (shouldFetch) {
        lastIndexFetchAt.set(next.peerId, now)
        const url = deps.getRemoteIndexUrl(next)
        try {
          const payload = await fetchJson<{ peerId: string; files: RemoteIndex['files'] }>(url)
          deps.onRemoteIndexUpdated({ peerId: payload.peerId, files: payload.files, fetchedAt: Date.now() })
        } catch {
          // ignore
        }
      }
      return
    }

    if (msg.type === 'FILE_REQUEST') {
      if (await deps.hasLocalFile(msg.path)) {
        const offer: FileOfferMessage = {
          type: 'FILE_OFFER',
          requestId: msg.requestId,
          peerId: deps.peerId,
          path: msg.path,
          httpPort: deps.httpPort,
          ts: Date.now(),
        }
        const buf = encodeDiscoveryMessage(offer)
        socket.send(buf, 0, buf.length, DISCOVERY_PORT, rinfo.address)
      }
      return
    }

    if (msg.type === 'FILE_OFFER') {
      if (msg.peerId === deps.peerId) return
      const pending = pendingOffers.get(msg.requestId)
      if (!pending) return
      if (pending.targetPath !== msg.path) return

      const peer =
        peers.get(msg.peerId) ??
        ({
          peerId: msg.peerId,
          name: msg.peerId,
          address: rinfo.address,
          httpPort: msg.httpPort,
          lastSeen: Date.now(),
        } satisfies PeerInfo)

      pending.offers.set(msg.peerId, peer)
      return
    }
  })

  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject)
    socket.bind(DISCOVERY_PORT, '0.0.0.0', () => resolve())
  })
  socket.setBroadcast(true)

  const announceTimer = setInterval(announce, DISCOVERY_ANNOUNCE_INTERVAL_MS)
  const sweepTimer = setInterval(sweep, 1500)
  announce()

  return {
    close: async () => {
      clearInterval(announceTimer)
      clearInterval(sweepTimer)
      await new Promise<void>(resolve => socket.close(() => resolve()))
    },
    getPeers: () => [...peers.values()],
    requestFileOffers: (wirePath: string, timeoutMs = 1200) =>
      new Promise<PeerInfo[]>(resolve => {
        const requestId = `${deps.peerId}-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
        const request: FileRequestMessage = { type: 'FILE_REQUEST', requestId, path: wirePath, ts: Date.now() }
        const buf = encodeDiscoveryMessage(request)
        for (const addr of broadcastAddresses()) {
          socket.send(buf, 0, buf.length, DISCOVERY_PORT, addr)
        }

        const offers = new Map<string, PeerInfo>()
        pendingOffers.set(requestId, { targetPath: wirePath, offers, done: resolve })
        setTimeout(() => {
          pendingOffers.delete(requestId)
          resolve([...offers.values()])
        }, timeoutMs)
      }),
  }
}
