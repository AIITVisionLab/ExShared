<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { LibraryEntry, PeerInfo } from '../shared/types'
import { bridge, type AppInfo } from './api/bridge'
import FileTable from './components/FileTable.vue'

const info = ref<AppInfo | null>(null)
const peers = ref<PeerInfo[]>([])
const library = ref<LibraryEntry[]>([])
const loading = ref(true)
const errorMsg = ref<string | null>(null)
const downloading = ref<Set<string>>(new Set())
const currentDir = ref<string>('')

const downloadingPaths = computed(() => [...downloading.value])

function parentDir(dir: string): string {
  if (!dir) return ''
  const parts = dir.split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

function computeDirSizes(entries: LibraryEntry[]): Map<string, number> {
  const sizes = new Map<string, number>()
  for (const entry of entries) {
    if (entry.kind !== 'file') continue
    if (!Number.isFinite(entry.size) || entry.size <= 0) continue
    const parts = entry.path.split('/').filter(Boolean)
    for (let i = 0; i < parts.length - 1; i++) {
      const dirPath = parts.slice(0, i + 1).join('/')
      sizes.set(dirPath, (sizes.get(dirPath) ?? 0) + entry.size)
    }
  }
  return sizes
}

function buildListing(entries: LibraryEntry[], dir: string, dirSizes: Map<string, number>): LibraryEntry[] {
  const prefix = dir ? `${dir}/` : ''
  const dirs = new Map<string, { availablePeerIds: Set<string>; hasDownloadedChild: boolean }>()
  const directMap = new Map<string, LibraryEntry>()

  for (const entry of entries) {
    if (dir) {
      if (entry.path === dir) continue
      if (!entry.path.startsWith(prefix)) continue
    }

    const rel = dir ? entry.path.slice(prefix.length) : entry.path
    if (!rel) continue

    const slashIdx = rel.indexOf('/')
    if (slashIdx === -1) {
      const existing = directMap.get(entry.path)
      if (!existing) {
        directMap.set(entry.path, entry)
      } else if (existing.status !== 'downloaded' && entry.status === 'downloaded') {
        directMap.set(entry.path, entry)
      }
      continue
    }

    const segment = rel.slice(0, slashIdx)
    const fullDirPath = prefix ? `${prefix}${segment}` : segment
    let agg = dirs.get(fullDirPath)
    if (!agg) {
      agg = { availablePeerIds: new Set<string>(), hasDownloadedChild: false }
      dirs.set(fullDirPath, agg)
    }

    for (const peerId of entry.availablePeerIds) agg.availablePeerIds.add(peerId)
    if (entry.status === 'downloaded') agg.hasDownloadedChild = true
  }

  const dirEntries: LibraryEntry[] = []
  for (const [path, agg] of dirs.entries()) {
    const existing = directMap.get(path)
    if (existing && existing.kind === 'dir') {
      const mergedPeers = new Set<string>(existing.availablePeerIds)
      for (const peerId of agg.availablePeerIds) mergedPeers.add(peerId)
      dirEntries.push({
        ...existing,
        availablePeerIds: [...mergedPeers],
        status: existing.status === 'downloaded' || agg.hasDownloadedChild ? 'downloaded' : 'missing',
        size: dirSizes.get(path) ?? existing.size ?? 0,
      })
      directMap.delete(path)
      continue
    }

    dirEntries.push({
      path,
      kind: 'dir',
      size: 0,
      mtimeMs: 0,
      status: agg.hasDownloadedChild ? 'downloaded' : 'missing',
      availablePeerIds: [...agg.availablePeerIds],
    })
  }

  const merged = [...dirEntries, ...directMap.values()].map(entry => {
    if (entry.kind === 'dir') {
      return {
        ...entry,
        size: dirSizes.get(entry.path) ?? entry.size ?? 0,
      }
    }
    return entry
  })
  merged.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
    return a.path.localeCompare(b.path)
  })
  return merged
}

const dirSizes = computed(() => computeDirSizes(library.value))
const viewEntries = computed(() => buildListing(library.value, currentDir.value, dirSizes.value))

const breadcrumbs = computed(() => {
  const parts = currentDir.value ? currentDir.value.split('/').filter(Boolean) : []
  const crumbs: Array<{ name: string; path: string }> = [{ name: '根目录', path: '' }]
  for (let i = 0; i < parts.length; i++) {
    crumbs.push({ name: parts[i], path: parts.slice(0, i + 1).join('/') })
  }
  return crumbs
})

let refreshTimer: number | null = null
function scheduleRefresh() {
  if (refreshTimer) window.clearTimeout(refreshTimer)
  refreshTimer = window.setTimeout(() => {
    refreshLibrary().catch(e => {
      errorMsg.value = e instanceof Error ? e.message : String(e)
    })
  }, 250)
}

async function refreshPeers() {
  peers.value = await bridge.getPeers()
}

async function refreshLibrary() {
  library.value = await bridge.getLibrary()
}

async function refreshAll() {
  loading.value = true
  errorMsg.value = null
  try {
    await Promise.all([refreshPeers(), refreshLibrary()])
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function onClickRefresh() {
  await bridge.refresh()
  await refreshAll()
}

async function downloadFile(wirePath: string) {
  downloading.value.add(wirePath)
  errorMsg.value = null
  try {
    const result = await bridge.download(wirePath)
    if (!result.ok) errorMsg.value = result.error ?? 'download failed'
    await refreshAll()
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : String(e)
  } finally {
    downloading.value.delete(wirePath)
  }
}

function openDir(wirePath: string) {
  currentDir.value = wirePath
}

function goUp() {
  currentDir.value = parentDir(currentDir.value)
}

onMounted(async () => {
  try {
    info.value = await bridge.getInfo()
    await refreshAll()
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : String(e)
  }

  bridge.onPeersUpdated(p => {
    peers.value = p
    scheduleRefresh()
  })
  bridge.onFilesUpdated(() => scheduleRefresh())
  bridge.onRemoteIndexUpdated(() => scheduleRefresh())
})
</script>

<template>
  <div class="app">
    <header class="header">
      <div class="title">
        <div class="name">ExShared</div>
        <div class="sub muted">
          共享目录：<span class="mono">{{ info?.sharedDir ?? '-' }}</span>
        </div>
      </div>
      <div class="actions">
        <div class="menu">
          <button class="btn btnGhost" type="button">本机</button>
          <div class="dropdown">
            <div class="sectionTitle">本机信息</div>
            <div class="row">
              <div class="label">peerId</div>
              <div class="value mono">{{ info?.peerId ?? '-' }}</div>
            </div>
            <div class="row">
              <div class="label">HTTP</div>
              <div class="value mono">{{ info?.httpPort ?? '-' }}</div>
            </div>
          </div>
        </div>
        <div class="menu">
          <button class="btn btnGhost" type="button">用户</button>
          <div class="dropdown">
            <div class="sectionTitle">在线用户（{{ peers.length }}）</div>
            <div v-if="peers.length === 0" class="muted">暂无</div>
            <div v-for="p in peers" :key="p.peerId" class="peer">
              <div class="peerName">{{ p.name }}</div>
              <div class="peerMeta mono">{{ p.address }}:{{ p.httpPort }}</div>
            </div>
          </div>
        </div>
      </div>
    </header>

    <div v-if="errorMsg" class="error">
      {{ errorMsg }}
    </div>

    <main class="main">
      <section class="content">
        <div class="contentHead">
          <button
            class="iconBtn"
            type="button"
            title="刷新"
            aria-label="刷新"
            @click="onClickRefresh"
            :disabled="loading"
          >
            ⟳
          </button>
          <div class="contentTitle">
            文件库 <span class="muted">({{ library.length }})</span>
          </div>
        </div>
        <div class="nav">
          <button class="btn btnGhost" type="button" @click="goUp" :disabled="!currentDir">上一级</button>
          <div class="crumbs">
            <span
              v-for="(c, idx) in breadcrumbs"
              :key="c.path"
              class="crumb"
              :class="{ active: idx === breadcrumbs.length - 1 }"
              @click="openDir(c.path)"
            >
              {{ c.name }}
            </span>
            <span v-if="breadcrumbs.length > 1" class="sep muted">（双击文件夹进入）</span>
          </div>
        </div>
        <FileTable
          :entries="viewEntries"
          :downloading-paths="downloadingPaths"
          :current-dir="currentDir"
          @download="downloadFile"
          @openDir="openDir"
        />
        <div class="hint muted">
          提示：把文件放进 <span class="mono">~/ExSharedDIR</span>（Windows 为用户目录下的 <span class="mono">ExSharedDIR</span>）
          ，其他设备会在局域网内自动发现并显示“未下载”的文件。
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
  background: var(--panel);
}

.name {
  font-size: 18px;
  font-weight: 800;
}

.sub {
  margin-top: 4px;
  font-size: 13px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.main {
  display: flex;
  padding: 14px;
  min-height: 0;
  flex: 1;
}

.content {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.contentTitle {
  font-weight: 800;
  font-size: 14px;
}

.contentHead {
  display: flex;
  align-items: center;
  gap: 10px;
}

.nav {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.crumbs {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex-wrap: wrap;
}

.crumb {
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--panel) 85%, var(--fg) 15%);
  cursor: pointer;
  font-size: 12px;
}

.crumb.active {
  border-color: color-mix(in srgb, var(--accent) 65%, var(--border) 35%);
  color: color-mix(in srgb, var(--accent) 75%, var(--fg) 25%);
}

.sep {
  font-size: 12px;
}

.row {
  display: grid;
  grid-template-columns: 70px 1fr;
  gap: 10px;
  margin-bottom: 6px;
  font-size: 13px;
}

.label {
  color: var(--muted);
}

.value {
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn {
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--panel) 88%, var(--fg) 12%);
  color: var(--fg);
  cursor: pointer;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.2px;
  transition: transform 120ms ease, border-color 160ms ease, background 160ms ease;
}

.btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border) 55%);
  background: color-mix(in srgb, var(--panel) 80%, var(--fg) 20%);
  transform: translateY(-1px);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.btnAccent {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border) 45%);
  background: color-mix(in srgb, var(--accent) 16%, var(--panel) 84%);
}

.btnAccent:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--accent) 70%, var(--border) 30%);
  background: color-mix(in srgb, var(--accent) 22%, var(--panel) 78%);
}

.btnGhost {
  background: transparent;
}

.btnGhost:hover:not(:disabled) {
  background: color-mix(in srgb, var(--panel) 85%, var(--fg) 15%);
}

.menu {
  position: relative;
}

.menu:hover .dropdown {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  width: 280px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--panel) 92%, var(--fg) 8%);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
  opacity: 0;
  transform: translateY(-6px);
  transition: opacity 140ms ease, transform 140ms ease;
  pointer-events: none;
  z-index: 20;
}

.sectionTitle {
  font-weight: 700;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 8px;
}

.peer {
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--panel) 85%, var(--fg) 15%);
  margin-bottom: 8px;
}

.peer:last-child {
  margin-bottom: 0;
}

.peerName {
  font-size: 12px;
  font-weight: 600;
}

.peerMeta {
  font-size: 12px;
  color: var(--muted);
  margin-top: 3px;
}

.iconBtn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--panel) 86%, var(--fg) 14%);
  color: var(--fg);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: transform 120ms ease, border-color 160ms ease, background 160ms ease;
}

.iconBtn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border) 45%);
  background: color-mix(in srgb, var(--panel) 80%, var(--fg) 20%);
  transform: translateY(-1px) rotate(-6deg);
}

.iconBtn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.muted {
  color: var(--muted);
}

.error {
  margin: 12px 14px 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--danger) 70%, var(--border) 30%);
  border-radius: 10px;
  background: color-mix(in srgb, var(--danger) 15%, var(--panel) 85%);
  color: color-mix(in srgb, var(--danger) 85%, white 15%);
}

.hint {
  font-size: 12px;
  margin-top: 6px;
  line-height: 1.6;
}
</style>
