<script setup lang="ts">
import type { PeerInfo } from '../../shared/types'

defineProps<{
  peers: PeerInfo[]
}>()
</script>

<template>
  <div class="panel">
    <div class="title">在线用户</div>
    <div v-if="peers.length === 0" class="empty">暂无</div>
    <div v-for="p in peers" :key="p.peerId" class="peer">
      <div class="name">{{ p.name }}</div>
      <div class="meta mono">{{ p.address }}:{{ p.httpPort }}</div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel);
  padding: 12px;
}

.title {
  font-weight: 700;
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 10px;
}

.peer {
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--panel) 85%, var(--fg) 15%);
  margin-bottom: 10px;
}

.name {
  font-size: 13px;
  font-weight: 600;
}

.meta {
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.empty {
  color: var(--muted);
  padding: 10px 0;
}
</style>

