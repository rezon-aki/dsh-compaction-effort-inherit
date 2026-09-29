# dsh-compaction-effort-inherit

[简体中文](README.md) · **English**

[![license](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![format](https://img.shields.io/badge/format-DSH%20bundle-blueviolet.svg)](cordis.patch.yml)

> Make the compaction summarization call **inherit the session's reasoning effort** — otherwise it lands in a different provider cache bucket and re-bills the whole context at full price.

**Why this exists.** DSH's official `compaction-basic` replays the conversation prefix so the summarization call can reuse the provider's warm prefix cache. But it reads only `provider` / `model` from the session's request header and **drops `reasoningEffort`**; the missing value is then filled in from the adapter default. DeepSeek's prefix cache is **bucketed by thinking strength**: same prefix and same effort hits, a different effort reports `cache_read_input_tokens: 0`. So a session running at `max` pays a full-price re-read of its entire context on every compaction.

## Measured

Same fresh prefix, only `output_config.effort` changed, against `api.deepseek.com/anthropic` (model `deepseek-flash`):

| Call | effort | input | cacheRead | |
|---|---|---|---|---|
| high (cold) | high | 7094 | 0 | MISS |
| high again | high | 182 | 6912 | HIT |
| **mode changed** | **max** | 7094 | **0** | **MISS** |
| max again | max | 182 | 6912 | HIT |
| thinking disabled | off | 7069 | 0 | MISS |
| high again | high | 182 | 6912 | HIT |
| high, `max_tokens` × 8 | high | 182 | 6912 | HIT |

Effort is part of the cache key; `max_tokens` is not.

Through the real DSH compaction path, on a session routed at `max`:

| | input | cacheRead | |
|---|---|---|---|
| before | 8030 | 0 | MISS |
| after | 158 | 7552 | HIT |
| after (session at `high`) | 222 | 7808 | HIT |
| after removal | 7710 | 0 | MISS |

## Install

```bash
dsh plugin --profile web add github:rezon-aki/dsh-compaction-effort-inherit
```

Restart the profile. Remove with `dsh plugin --profile web remove dsh-compaction-effort-inherit`.

## Safety

- **The official plugin is untouched**: no patching, no wrapping, no reconfiguring. One `llm/stream` listener on the same seam `dsh-session-title` and `dsh-session-checkpoint-policy` already use.
- **Compaction calls only**; every other request returns through untouched.
- **Fail-open**: any failure in the listener falls through to the original call.
- Zero dependencies, zero build step, no files or settings written.

Details: [docs/DESIGN.md](docs/DESIGN.md) · measurements: [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md).
