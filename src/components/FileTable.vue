<script setup lang="ts">
import type { LibraryEntry } from '../../shared/types'

const props = defineProps<{
  entries: LibraryEntry[]
  downloadingPaths: string[]
  currentDir: string
}>()

const emit = defineEmits<{
  (e: 'download', wirePath: string): void
  (e: 'openDir', wirePath: string): void
}>()

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let idx = 0
  let value = bytes
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024
    idx++
  }
  return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`
}

function statusLabel(entry: LibraryEntry): string {
  if (entry.status === 'downloaded') return '已下载'
  return '未下载'
}

function isDownloading(wirePath: string): boolean {
  return props.downloadingPaths.includes(wirePath)
}

function displayName(wirePath: string): string {
  if (!props.currentDir) return wirePath
  const prefix = props.currentDir.endsWith('/') ? props.currentDir : `${props.currentDir}/`
  if (!wirePath.startsWith(prefix)) return wirePath
  return wirePath.slice(prefix.length)
}
</script>

<template>
  <div class="tableWrap">
    <table class="table">
      <thead>
        <tr>
          <th>路径</th>
          <th class="colSize">大小</th>
          <th class="colPeers">来源</th>
          <th class="colStatus">状态</th>
          <th class="colAction">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="entry in entries"
          :key="entry.path"
          class="row"
          :class="{ clickable: entry.kind === 'dir' }"
          @dblclick="entry.kind === 'dir' ? emit('openDir', entry.path) : null"
        >
          <td class="mono">
            <span class="kind" :class="entry.kind">{{ entry.kind === 'dir' ? 'DIR' : 'FILE' }}</span>
            {{ displayName(entry.path) }}
          </td>
          <td class="colSize mono">{{ entry.size > 0 ? formatBytes(entry.size) : '-' }}</td>
          <td class="colPeers">
            <span v-if="entry.availablePeerIds.length">{{ entry.availablePeerIds.length }} 个用户</span>
            <span v-else class="muted">-</span>
          </td>
          <td class="colStatus">
            <span class="badge" :class="entry.status">{{ statusLabel(entry) }}</span>
          </td>
          <td class="colAction">
            <button
              v-if="entry.kind === 'file' && entry.status === 'missing'"
              class="btn"
              :disabled="!entry.availablePeerIds.length || isDownloading(entry.path)"
              @click="emit('download', entry.path)"
            >
              {{ isDownloading(entry.path) ? '下载中...' : '下载' }}
            </button>
            <span v-else class="muted">-</span>
          </td>
        </tr>
        <tr v-if="entries.length === 0">
          <td class="empty" colspan="5">暂无文件</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.row {
  user-select: none;
}

.row:hover {
  cursor: default;
}

.row:hover td {
  background: color-mix(in srgb, var(--panel) 90%, var(--fg) 10%);
}

.row.clickable:hover {
  cursor: pointer;
}

.tableWrap {
  width: 100%;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel);
}

.table {
  width: 100%;
  border-collapse: collapse;
}

thead th {
  position: sticky;
  top: 0;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  text-align: left;
  font-weight: 600;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--muted);
}

tbody td {
  border-bottom: 1px solid var(--border);
  padding: 10px 12px;
  font-size: 13px;
}

tbody tr:hover td {
  background: color-mix(in srgb, var(--panel) 90%, var(--fg) 10%);
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.colSize,
.colPeers,
.colStatus,
.colAction {
  width: 110px;
  white-space: nowrap;
}

.badge {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid var(--border);
}

.badge.downloaded {
  color: color-mix(in srgb, var(--ok) 85%, white 15%);
  border-color: color-mix(in srgb, var(--ok) 60%, var(--border) 40%);
  background: color-mix(in srgb, var(--ok) 20%, var(--panel) 80%);
}

.badge.missing {
  color: color-mix(in srgb, var(--warn) 85%, white 15%);
  border-color: color-mix(in srgb, var(--warn) 60%, var(--border) 40%);
  background: color-mix(in srgb, var(--warn) 18%, var(--panel) 82%);
}

.btn {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--panel) 75%, var(--fg) 25%);
  color: var(--fg);
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.kind {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  min-width: 38px;
  margin-right: 8px;
  border-radius: 6px;
  border: 1px solid var(--border);
  font-size: 11px;
  color: var(--muted);
}

.kind.file {
  color: color-mix(in srgb, var(--accent) 70%, var(--fg) 30%);
}

.kind.dir {
  color: color-mix(in srgb, var(--muted) 70%, var(--fg) 30%);
}

.muted {
  color: var(--muted);
}

.empty {
  text-align: center;
  color: var(--muted);
  padding: 24px;
}
</style>
