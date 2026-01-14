<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { LibraryEntry, PeerInfo } from '../shared/types'
import { bridge, type AppInfo } from './api/bridge'
import PeerList from './components/PeerList.vue'
import FileTable from './components/FileTable.vue'

const info = ref<AppInfo | null>(null)
const peers = ref<PeerInfo[]>([])
const library = ref<LibraryEntry[]>([])
const loading = ref(true)
const errorMsg = ref<string | null>(null)
const downloading = ref<Set<string>>(new Set())

const downloadingPaths = computed(() => [...downloading.value])

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
        <button class="btn" type="button" @click="onClickRefresh" :disabled="loading">刷新</button>
      </div>
    </header>

    <div v-if="errorMsg" class="error">
      {{ errorMsg }}
    </div>

    <main class="main">
      <aside class="sidebar">
        <PeerList :peers="peers" />
        <div class="panel">
          <div class="panelTitle">本机信息</div>
          <div class="row">
            <div class="label">peerId</div>
            <div class="value mono">{{ info?.peerId ?? '-' }}</div>
          </div>
          <div class="row">
            <div class="label">HTTP</div>
            <div class="value mono">{{ info?.httpPort ?? '-' }}</div>
          </div>
        </div>
      </aside>

      <section class="content">
        <div class="contentTitle">
          文件库 <span class="muted">({{ library.length }})</span>
        </div>
        <FileTable :entries="library" :downloading-paths="downloadingPaths" @download="downloadFile" />
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

.main {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 14px;
  padding: 14px;
  min-height: 0;
  flex: 1;
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
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

.panel {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel);
  padding: 12px;
}

.panelTitle {
  font-weight: 700;
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 10px;
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
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--panel) 75%, var(--fg) 25%);
  color: var(--fg);
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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
