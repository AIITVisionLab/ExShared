# 局域网文件共享软件（ExShared）

这是一个 **Electron + Vue3** 的模板工程，目标是做一个“共享文件资源管理器”：把自己与局域网内其他用户共享的文件汇总展示；本机没有的文件标记为“未下载”，并可以向拥有该文件的用户请求下载。

## 工程结构（当前实现）

相比“最终形态”的完整分层（DB、增量同步、控制通道状态机等），当前版本先落地最小可用闭环：
- 读取用户目录下的 `ExSharedDIR`
- UDP 广播发现局域网内的其他 ExShared 实例
- 通过 HTTP 拉取对方索引，并按文件路径合并展示
- 对“未下载”的文件发起下载（广播询问 → 选择可用 peer → HTTP 拉取）

```
exshared/
  shared/                          # main/renderer 共享：类型、协议、常量
    constants.ts
    protocol.ts
    types.ts

  electron/
    main/
      main.ts                      # Electron 入口：创建窗口、启动模块、注册 IPC
      appEnv.ts                    # ExSharedDIR、peerId 等运行时信息
      sharedIndex.ts               # 扫描共享目录、路径安全处理
      httpServer.ts                # 提供 /index 与 /file
      discovery.ts                 # UDP 广播发现 + FILE_REQUEST/OFFER
      ipc.ts                       # renderer 调用的 IPC handlers
    preload.ts                     # contextBridge 暴露 window.api

  src/                             # Vue3（renderer）
    api/bridge.ts                  # 对 window.api 的薄封装
    components/
      PeerList.vue
      FileTable.vue
    App.vue                        # 文件库（已下载/未下载）+ 在线用户
```

## 跨平台共享目录

默认共享目录为：`<用户目录>/ExSharedDIR`（Windows/macOS/Linux 都一致，只是“用户目录”不同）。应用启动时会自动创建该目录。

## 本地联调建议

- 准备两台在同一局域网的机器（或同机双开应用）
- 在任意一台机器的 `ExSharedDIR` 放入文件
- 另一台机器打开后会看到该文件为“未下载”，点击“下载”即可拉取到本机 `ExSharedDIR`
