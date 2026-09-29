# Changelog

## 0.1.0 — 2026-09-29

首个公开版本。

- 压缩摘要调用沿用会话最近一次真实路由请求的 `reasoningEffort`，让摘要请求落回主对话所在的 provider 缓存桶。
- 挂点只有一处：`llm/stream` 事件上的全局监听。不 patch、不 wrap、不重配官方 `dsh-compaction-basic`。
- 五道闸门（非压缩调用 / 已显式指定档位 / 无 live 会话 / 跨路由 / 适配器默认档位）一律放行；监听体整体 fail-open。
- 实测（见 `docs/ACCEPTANCE.md`）：会话 `max` 时，同一条压缩调用从 `cacheRead=0` 变为命中；卸载后立刻退回 `0`。
