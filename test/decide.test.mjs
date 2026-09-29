import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inheritEffort } from '../lib/decide.js'

const options = (extra = {}) => ({ purpose: 'compaction', provider: 'deepseek-official', model: 'deepseek-flash', ...extra })
const header = (config, adapterDefaults = {}) => ({ config: { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'max', ...config }, adapterDefaults })

test('inherits the session effort for a compaction call on the same route', () => {
  assert.equal(inheritEffort(options(), header({})), 'max')
})

test('ignores every other purpose', () => {
  assert.equal(inheritEffort(options({ purpose: undefined }), header({})), undefined)
  assert.equal(inheritEffort(options({ purpose: 'session-title' }), header({})), undefined)
})

test('never overrides an effort the caller already set', () => {
  assert.equal(inheritEffort(options({ reasoningEffort: 'low' }), header({})), undefined)
})

test('skips a different summarization route', () => {
  assert.equal(inheritEffort(options({ model: 'deepseek-v4-pro' }), header({})), undefined)
  assert.equal(inheritEffort(options(), header({ model: 'deepseek-v4-pro' })), undefined)
})

test('skips when no live session header exists', () => {
  assert.equal(inheritEffort(options(), undefined), undefined)
  assert.equal(inheritEffort(options(), {}), undefined)
})

test('skips an adapter-materialized effort, which already shares the default bucket', () => {
  assert.equal(inheritEffort(options(), header({}, { reasoningEffort: true, maxTokens: true })), undefined)
})

test('skips an absent or empty effort', () => {
  assert.equal(inheritEffort(options(), header({ reasoningEffort: undefined })), undefined)
  assert.equal(inheritEffort(options(), header({ reasoningEffort: '' })), undefined)
})
