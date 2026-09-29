# dsh-compaction-effort-inherit · 压缩不再作废前缀缓存

**简体中文** · [English](README.en.md)

[![license](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![format](https://img.shields.io/badge/format-DSH%20bundle-blueviolet.svg)](cordis.patch.yml)
[![tests](https://img.shields.io/badge/tests-7%20passing-brightgreen.svg)](test/decide.test.mjs)

> 让上下文压缩的摘要请求**沿用会话当前的思考档位**——否则它会落到另一个缓存桶里，把整个上下文按未缓存价重算一遍。

**为什么有这个项目**：官方 `compaction-basic` 会重放整段对话前缀去调摘要模型，本意就是复用 provider 的 warm prefix cache。但它从会话请求头里只取了 `provider` / `model`，**把 `reasoningEffort` 丢掉了**；缺失的档位由 LLM 层用适配器默认值补上。DeepSeek 的前缀缓存**按思考档位分桶**——同前缀、同档位命中，换了档位则 `cache_read_input_tokens` 归零。于是会话跑在 `max` 时，每次压缩都要为整段上下文再付一次全价。

## 实测：换档位就是全量 miss

同一段全新前缀，只改 `output_config.effort`，直接打 `api.deepseek.com/anthropic`（model `deepseek-flash`）：

| 调用 | 档位 | input | cacheRead | 判定 |
|---|---|---|---|---|
| 1 | high（冷启） | 7094 | 0 | MISS |
| 2 | high（同档） | 182 | **6912** | HIT |
| 3 | **max**（换档） | 7094 | **0** | **MISS** |
| 4 | max（同档） | 182 | 6912 | HIT |
| 5 | **off**（thinking disabled） | 7069 | **0** | **MISS** |
| 6 | off（同档） | 157 | 6912 | HIT |
| 7 | high（切回来） | 182 | 6912 | HIT |
| 8 | high，`max_tokens` 改 8 倍 | 182 | 6912 | HIT |

两个结论：**档位进缓存键**（第 3、5 行），**`max_tokens` 不进**（第 8 行）。每个档位各自留桶、互不干扰（第 7 行）。

## 装完什么样

同一个会话、同一段前缀，走真实 DSH 压缩调用路径（`ctx.llm.stream` + `purpose: 'compaction'`）：

| 状态 | 会话档位 | input | cacheRead | 判定 |
|---|---|---|---|---|
| 装之前 | max | 8030 | 0 | MISS |
| 装之后 | max | 158 | **7552** | HIT |
| 装之后（high 会话） | high | 222 | **7808** | HIT |
| 卸载之后 | max | 7710 | 0 | MISS |

第三行是重点：它读会话自己的档位，不是写死成某一个值。

## 安装

**方式一：DSH 插件面板** —— 侧栏 →「插件」→「添加插件」：

```
github:rezon-aki/dsh-compaction-effort-inherit
```

**方式二：命令行**：

```bash
dsh plugin --profile web add github:rezon-aki/dsh-compaction-effort-inherit
```

装完重启 profile。

卸载：

```bash
dsh plugin --profile web remove dsh-compaction-effort-inherit
```

插件不写文件、不写设置、不加工具、没有客户端资源，卸载即净。

## 安全边界

- **不碰官方插件**：不 patch 它的文件、不包装它的类、不改它的配置。挂点只有一处——`llm/stream` 事件（`dsh-session-title`、`dsh-session-checkpoint-policy`、`dsh-llm/invariant` 用的是同一个 seam）。
- **只影响压缩调用**：非 `purpose: 'compaction'` 的请求在第一道判断就放行，主对话、子 agent、会话标题全不受影响。
- **fail-open**：监听体整体 try/catch，任何异常直接放行，插件坏了也不会阻断压缩。
- **零依赖、零构建**：手写 ESM，没有运行时依赖，没有构建步骤。

## 它怎么做到的

```js
ctx.on('llm/stream', (options, next) => {
  if (options.purpose !== 'compaction') return next()
  try {
    const effort = inheritEffort(options, ctx.sessions.get(options.sessionId)?.requestHeader?.())
    if (effort !== undefined) options.reasoningEffort = effort
  } catch { /* fail open */ }
  return next()
}, { global: true })
```

三个容易踩的点，细节见 [docs/DESIGN.md](docs/DESIGN.md)：

1. **必须原地改 `options`**。cordis 的 `next` 不接受参数，返回 `next({ ...options })` 是静默无效的。
2. **档位取自 `session.requestHeader()`**，也就是"上一个真正发出去的请求用了什么档位"——那才是当前热着的缓存桶。这也与 agent-loop 自己的解析规则一致（请求头里带 `adapterDefaults.reasoningEffort: true` 时双方都忽略它）。
3. **跨路由放行**：有人给压缩配了另一个 `summarizationProvider/Model` 时，继承过来的档位可能不被目标模型支持。

## 边界

- 只在**会话显式档位 ≠ 适配器默认档位**时有可观测收益。会话本来就在 `high`（适配器默认）时，两个请求本就同桶。
- 不改变压缩行为本身：摘要区间、保留策略、`maxTokens` 都不动（实测 `max_tokens` 不进缓存键）。
- 不管 `session-title`：适配器对它强制 `off`，且它没有可复用的前缀。
- 只验证过 DSH `0.1.7-rc.2` + profile `web`。

## 开发

```bash
npm test        # node --test，7 条判定用例
```

实测记录（怎么做、数字从哪来）在 [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md)。
