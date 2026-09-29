# 设计

## 链路上的位置

```
compaction-basic   构造 options: provider/model/messages/tools/maxTokens/sessionId/purpose
                   读了 session.requestHeader()，却只取 provider + model
        ↓ ctx.llm.stream(options)
dsh-llm            resolveCallWithInfo: effective = requested ?? info.reasoning.defaultEffort
                   用适配器默认值补齐，并标记 adapterDefaults.reasoningEffort = true
        ↓
deepseek 适配器     effort = options.reasoningEffort ?? connection.defaults.reasoningEffort ?? "high"
                   → 写进 output_config.effort
```

本机连接未配置 `reasoningEffort`，所以补出来恒为 `high`；会话跑在 `max` 时两者不同桶。

## 挂点

`ctx.on('llm/stream', handler, { global: true })`。llm 服务每次调用都走
`ctx.waterfall(this, 'llm/stream', options, () => this.adapterStream(...))`，这是官方自己的扩展点。

`global: true` 是必须的：事件由 host 平面的 llm 服务实例发出，插件实例是 profile root 的子上下文，非 global 监听收不到。

不选另外两条路：包装 `ctx.llm.stream` 是猴子补丁，卸载要手工还原；改官方插件会在升级时被覆盖。挂事件则随 fiber dispose 自动摘除。

## 必须原地改对象

cordis 的 waterfall 是：

```js
const inner = args.pop()
const next = () => (cbs.shift() ?? inner)(...args)   // next 不接受参数
```

官方 fallback 是 `() => this.adapterStream(options, prepared)`，闭包拿原对象。因此
`return next({ ...options, reasoningEffort })` 静默无效，唯一有效写法是
`options.reasoningEffort = effort`。`compaction-basic` 的 options 是未冻结的对象字面量。

## 五道闸门

| # | 条件 | 放行原因 |
|---|---|---|
| 1 | `purpose !== 'compaction'` | 收窄爆炸半径：主对话、子 agent、会话标题不受影响 |
| 2 | `options.reasoningEffort !== undefined` | 调用方已指定就不夺权；同时让重复注册自动幂等 |
| 3 | 取不到 live 会话 / 请求头 | 没有可继承的事实 |
| 4 | 压缩目标 route ≠ 会话 route | 摘要走另一条路由时，继承的档位可能不被目标模型支持 |
| 5 | `adapterDefaults.reasoningEffort === true` | 该档位本就是适配器补的，agent-loop 也忽略它，天然同桶 |

## 为什么取 requestHeader()

它记录的是**上一个真正发出去的请求用了什么档位**，而 provider 的缓存桶正是按这个写的——它才是"当前热着的桶"的地面真值。附带一个好性质：用户中途切档但还没发过主请求时，请求头仍是旧值，而旧桶此刻仍然是热的，取旧值反而更对。

## 失败与卸载

监听体整体 try/catch，异常直接放行——插件坏了也不会阻断压缩，最多退回修复前行为。
卸载 = fiber dispose = 监听消失；插件不写文件、不写设置、不加工具。
