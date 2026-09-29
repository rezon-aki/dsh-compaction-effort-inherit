# 实测记录

测量口径：所有 `cacheRead` 都来自 provider 返回的 usage
（Anthropic 兼容端点为 `cache_read_input_tokens`，DSH 内部为 `TokenUsage.cacheReadTokens`；
DSH 的 `inputTokens` 是**未缓存**部分，两者不相交）。

## 1. 档位是否进缓存键（直连对照）

固定一段全新前缀，直接 POST `/anthropic/v1/messages`，只改 `output_config.effort` / `thinking`：

| 调用 | 档位 | input | cacheRead | 判定 |
|---|---|---|---|---|
| X1 | high（冷启） | 7094 | 0 | MISS |
| X2 | high | 182 | 6912 | HIT |
| X3 | max | 7094 | 0 | MISS |
| X4 | max | 182 | 6912 | HIT |
| X5 | off | 7069 | 0 | MISS |
| X6 | off | 157 | 6912 | HIT |
| X7 | high | 182 | 6912 | HIT |
| X8 | high，`max_tokens=65536` | 182 | 6912 | HIT |

结论：**档位（`output_config.effort` / `thinking`）进缓存键，`max_tokens` 不进**；每个档位各自留桶。
另一轮用不同前缀复测得到同样形状（7808 命中 / 换档归零），排除前缀污染。

## 2. 走真实 DSH 调用路径

在同一台 host 上预热前缀，再用 `ctx.llm.stream({ purpose: 'compaction', sessionId: <live session> })` 发真实调用：

| 状态 | 会话档位 | input | cacheRead | 判定 |
|---|---|---|---|---|
| 插件未注入 | max | 8030 | 0 | MISS |
| 注入后 | max | 158 | 7552 | HIT |
| 注入后（重复） | max | 158 | 7552 | HIT |
| 注入后（换 high 会话） | high | 222 | 7808 | HIT |
| 卸载后 | max | 7710 | 0 | MISS |
| 重新注入 | max | 158 | 7552 | HIT |

第 4 行证明是**继承**而非写死某个档位；卸载/重装两行证明监听随 fiber 干净增删。
bundle 双路径安装后复测：前缀 1350 → 压缩调用 198 / cacheRead 1152，仍为 HIT。

## 3. 环境

- provider `deepseek-official` / model `deepseek-flash`，端点为 DSH 默认的 Anthropic 兼容端点。
- 会话请求头档位 `max`，适配器默认档位 `high`（连接未配置 `reasoningEffort`）。
- DSH `0.1.7-rc.2`、profile `web`；单测 `node --test` 7/7。
