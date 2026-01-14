import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { URL } from 'node:url'
import type { FileMeta } from '../../shared/types'
import { FILE_SERVER_HOST } from '../../shared/constants'
import { resolveWirePathSafe, scanSharedDir } from './sharedIndex'

export interface FileServerDeps {
  sharedDir: string
  getPeerId: () => string
  getLocalIndex: () => Promise<FileMeta[]>
}

export interface FileServerHandle {
  port: number
  close: () => Promise<void>
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  const data = Buffer.from(JSON.stringify(payload), 'utf8')
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('content-length', data.length)
  res.end(data)
}

export async function startFileServer(deps: FileServerDeps): Promise<FileServerHandle> {
  await fsp.mkdir(deps.sharedDir, { recursive: true })

  const server = http.createServer(async (req, res) => {
    if (!req.url) return sendJson(res, 400, { error: 'missing url' })
    const url = new URL(req.url, 'http://localhost')

    if (url.pathname === '/ping') {
      return sendJson(res, 200, { ok: true, peerId: deps.getPeerId() })
    }

    if (url.pathname === '/index') {
      const files = await deps.getLocalIndex().catch(() => scanSharedDir(deps.sharedDir))
      return sendJson(res, 200, { peerId: deps.getPeerId(), files })
    }

    if (url.pathname === '/file') {
      const wirePath = url.searchParams.get('path') ?? ''
      if (!wirePath) return sendJson(res, 400, { error: 'missing path' })

      let absPath: string
      try {
        absPath = resolveWirePathSafe(deps.sharedDir, wirePath)
      } catch {
        return sendJson(res, 400, { error: 'invalid path' })
      }

      let stat: fs.Stats
      try {
        stat = await fsp.stat(absPath)
      } catch {
        return sendJson(res, 404, { error: 'not found' })
      }
      if (!stat.isFile()) return sendJson(res, 400, { error: 'not a file' })

      res.statusCode = 200
      res.setHeader('content-type', 'application/octet-stream')
      res.setHeader('content-length', stat.size)
      res.setHeader('x-file-name', path.basename(absPath))
      fs.createReadStream(absPath).pipe(res)
      return
    }

    return sendJson(res, 404, { error: 'not found' })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, FILE_SERVER_HOST, () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Failed to bind HTTP server')

  return {
    port: address.port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(err => (err ? reject(err) : resolve()))
      }),
  }
}

