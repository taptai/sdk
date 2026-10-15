// @tapt/sdk — the library entry. Bundled into the site, never loaded from tapt.
// init once with the Site's key and the site's own first-party endpoint, then
// track(type, payload) per action. Nothing here touches window at import time.
//
// Wire (curs lib/events/contract.ts, a strict object — extra fields reject):
//   POST <endpoint> as text/plain (no CORS preflight), body JSON of exactly
//   { sourceType: 'site', key, stepId?, type, sessionId, idempotencyKey, payload? }
// The ingest always answers 204; delivery is confirmed in the events table.

export const VERSION = '0.0.2'

export type EventType = 'page_viewed' | 'page_left' | 'clicked' | 'submitted'
export type Payload = Record<string, string>
export type InitOptions = {
  key: string // the Site's public key from `npx @tapt/sdk`: pk_ + 32 lowercase hex
  endpoint: string // the site's own path that forwards to e.tapt.online — required, no default
}

const KEY_RE = /^pk_[0-9a-f]{32}$/
const SESSION_KEY = 'tapt:sid'
const MAX_VALUE = 512 // the contract's cap per payload value and per stepId

type Config = { key: string; endpoint: string; sessionId: string }
let config: Config | null = null

export function init(options: InitOptions): void {
  if (!KEY_RE.test(options?.key ?? '')) throw new TypeError('tapt: init needs a key like pk_<32 hex>')
  if (!options.endpoint) throw new TypeError('tapt: init needs an endpoint')
  if (typeof window === 'undefined') return // SSR render: nothing to track here
  config = { key: options.key, endpoint: options.endpoint, sessionId: sessionId() }
  // Leaving fires from the beacon path; pagehide is the last event a dying page gets.
  window.addEventListener('pagehide', () => track('page_left'))
  const referrer = document.referrer
  track('page_viewed', referrer ? { referrer } : undefined)
}

export function track(type: EventType, payload?: Payload): void {
  if (!config) return // init hasn't run (or ran during SSR); analytics never breaks a page
  const body: Record<string, unknown> = {
    sourceType: 'site',
    key: config.key,
    type,
    sessionId: config.sessionId,
    idempotencyKey: crypto.randomUUID(),
  }
  const stepId = location.pathname.slice(0, MAX_VALUE)
  if (stepId) body.stepId = stepId
  if (payload) body.payload = clamp(payload)
  send(config.endpoint, JSON.stringify(body))
}

// One id per tab session, so a visitor's actions group. sessionStorage is per
// tab and dies with it, which is exactly the lifetime we want.
function sessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY)
    if (existing) return existing
    const fresh = crypto.randomUUID()
    sessionStorage.setItem(SESSION_KEY, fresh)
    return fresh
  } catch {
    return crypto.randomUUID() // storage blocked: a per-page id beats no id
  }
}

// Flat string→string, each value cut to the cap: one oversize value would
// otherwise reject the whole event on the strict schema.
function clamp(payload: Payload): Payload {
  const out: Payload = {}
  for (const [k, v] of Object.entries(payload)) {
    if (typeof v === 'string') out[k] = v.slice(0, MAX_VALUE)
  }
  return out
}

// A hidden page may be mid-teardown: sendBeacon is the browser's promise to
// deliver anyway. Otherwise keepalive fetch, which also survives navigation.
function send(endpoint: string, text: string): void {
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
  if (hidden && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    // A Blob pins the type to exactly text/plain, same as the fetch path.
    if (navigator.sendBeacon(endpoint, new Blob([text], { type: 'text/plain' }))) return
  }
  fetch(endpoint, {
    method: 'POST',
    body: text,
    headers: { 'content-type': 'text/plain' },
    keepalive: true,
    credentials: 'omit',
  }).catch(() => {}) // network failure is not the page's problem
}
