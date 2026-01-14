import type { WirePath } from './types'

export type DiscoveryMessage = HelloMessage | FileRequestMessage | FileOfferMessage

export interface HelloMessage {
  type: 'HELLO'
  peerId: string
  name: string
  httpPort: number
  ts: number
}

export interface FileRequestMessage {
  type: 'FILE_REQUEST'
  requestId: string
  path: WirePath
  ts: number
}

export interface FileOfferMessage {
  type: 'FILE_OFFER'
  requestId: string
  peerId: string
  path: WirePath
  httpPort: number
  ts: number
}

export function encodeDiscoveryMessage(message: DiscoveryMessage): Buffer {
  return Buffer.from(JSON.stringify(message), 'utf8')
}

export function decodeDiscoveryMessage(data: Buffer): DiscoveryMessage | null {
  try {
    const parsed = JSON.parse(data.toString('utf8')) as { type?: unknown }
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.type === 'HELLO' || parsed.type === 'FILE_REQUEST' || parsed.type === 'FILE_OFFER') {
      return parsed as DiscoveryMessage
    }
    return null
  } catch {
    return null
  }
}

