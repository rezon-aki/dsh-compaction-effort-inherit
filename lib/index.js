/**
 * Compaction summarization inherits the session's routed reasoning effort.
 *
 * Registers one \`llm/stream\` listener on the published seam: the official
 * compaction backend is neither patched nor wrapped, and disposing this plugin
 * removes the listener with it.
 *
 * cordis waterfall note: \`next\` ignores its arguments (cordis/lib/index.js:317),
 * so the intercepted options object must be mutated in place — returning
 * \`next({ ...options })\` would silently do nothing. \`dsh-compaction-basic\` builds
 * that object as an unfrozen literal.
 *
 * @module dsh-compaction-effort-inherit
 */
import { inheritEffort } from './decide.js'

export const name = 'compaction-effort-inherit'
export const inject = ['llm', 'sessions']

/**
 * @param ctx - plugin context carrying the llm and sessions services.
 */
export function apply(ctx) {
  ctx.on('llm/stream', (options, next) => {
    if (options.purpose !== 'compaction') return next()
    try {
      const effort = inheritEffort(options, ctx.sessions.get(options.sessionId)?.requestHeader?.())
      if (effort !== undefined) options.reasoningEffort = effort
    } catch {
      // Fail open: a broken lookup must never block compaction.
    }
    return next()
  }, { global: true })
}
