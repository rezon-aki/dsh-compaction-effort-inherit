/**
 * Decide whether one LLM call must inherit the session's routed reasoning effort.
 *
 * DeepSeek's automatic prefix cache is bucketed by thinking strength: an otherwise
 * identical request sent at a different `output_config.effort` reports
 * `cache_read_input_tokens: 0`. Compaction replays the conversation prefix to reuse
 * that cache, but `dsh-compaction-basic` resolves its route from the session's latest
 * request header while dropping that header's `reasoningEffort`, so the summary call
 * lands in the adapter-default bucket and re-bills the whole prefix.
 *
 * The session header is the right source: it records what the provider actually
 * received for the newest routed request, which is exactly the bucket that is warm.
 *
 * @param options - the outgoing call options as seen on the `llm/stream` waterfall.
 * @param header - the owning session's latest `requestHeader()`, when one is live.
 * @returns the effort to stamp, or undefined to leave the call untouched.
 */
export function inheritEffort(options, header) {
  if (options.purpose !== 'compaction') return undefined
  if (options.reasoningEffort !== undefined) return undefined
  const config = header?.config
  if (config === undefined) return undefined
  // A different summarization route may not accept this route's effort.
  if (config.provider !== options.provider || config.model !== options.model) return undefined
  // The loop ignores an adapter-materialized effort too (dsh-agent-loop:1156), so the
  // adapter default already lands in the same bucket.
  if (header.adapterDefaults?.reasoningEffort === true) return undefined
  const effort = config.reasoningEffort
  return typeof effort === 'string' && effort.length > 0 ? effort : undefined
}
