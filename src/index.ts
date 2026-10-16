// @tapt/sdk — the library entry. Bundled into the site, never loaded from tapt.
// init once with the Site's key and the site's own first-party endpoint, then
// track(type, payload) per action. Nothing here touches window at import time.
//
// Event wire (curs lib/events/contract.ts, a strict object — extra fields reject):
//   POST <endpoint> as text/plain (no CORS preflight), body JSON of exactly
//   { sourceType: 'site', key, stepId?, type, sessionId, idempotencyKey, payload? }
// Opt-in wire (curs lib/capture/contract.ts): POST <endpoint>/optin, body
//   { key, stepId?, sessionId, idempotencyKey, fields, stream? } — a stored record, not an event.
//   The ingest emits the journey's `submitted` itself beside the record.
// The ingest always answers 204; delivery is confirmed in the tables, not the status.

export const VERSION = '0.0.3'

export type EventType = 'page_viewed' | 'page_left' | 'clicked' | 'submitted'
export type Payload = Record<string, string>
export type InitOptions = {
  key: string // the Site's public key from `npx @tapt/sdk`: pk_ + 32 lowercase hex
  endpoint: string // the site's own path that forwards to e.tapt.online — required, no default
}

const KEY_RE = /^pk_[0-9a-f]{32}$/
// The ingest validates sessionId as a uuid and drops silently, so never trust a stored one blindly.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const SESSION_KEY = 'tapt:sid'
const MAX_VALUE = 512 // the contract's cap per payload value, field value, and stepId

// Opt-in capture is attribute-gated: only a form marked data-tapt-optin has its
// values stored. Unmarked forms are untouched — sites call track('submitted') as before.
const OPTIN_ATTR = 'data-tapt-optin'
const FIELD_ATTR = 'data-tapt-field' // opts a skipped input (hidden) back in
const MAX_FIELDS = 16
const MAX_FIELD_NAME = 64
const MAX_STREAM = 64
const NEVER = new Set(['password', 'file']) // no attribute overrides these
const NOISE = new Set(['submit', 'button', 'reset', 'image', 'fieldset']) // no user data

type Config = { key: string; endpoint: string; sessionId: string }
let config: Config | null = null
let formsBound = false

export function init(options: InitOptions): void {
  if (!KEY_RE.test(options?.key ?? '')) throw new TypeError('tapt: init needs a key like pk_<32 hex>')
  if (!options.endpoint) throw new TypeError('tapt: init needs an endpoint')
  if (typeof window === 'undefined') return // SSR render: nothing to track here
  config = { key: options.key, endpoint: options.endpoint, sessionId: sessionId() }
  // Leaving fires from the beacon path; pagehide is the last event a dying page gets.
  window.addEventListener('pagehide', () => track('page_left'))
  bindForms()
  const referrer = document.referrer
  track('page_viewed', referrer ? { referrer } : undefined)
}

// The per-tab session id, so a site can join its own server-side records to the journey.
export function getSessionId(): string | null {
  return config?.sessionId ?? null
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

// Capture phase so a page handler that stops propagation (SPA submits) can't hide the form.
function bindForms(): void {
  if (formsBound) return
  formsBound = true
  document.addEventListener(
    'submit',
    (e) => {
      const form = e.target as HTMLFormElement | null
      if (form?.elements && form.hasAttribute(OPTIN_ATTR)) capture(form)
    },
    true,
  )
}

function capture(form: HTMLFormElement): void {
  if (!config) return
  const fields = readFields(form)
  if (Object.keys(fields).length === 0) return // nothing anyone meant to store
  const stepId = location.pathname.slice(0, MAX_VALUE)
  // Deterministic per submission: a double-click or retry folds to one record,
  // the same person re-entering the same data folds too, different data does not.
  const idempotencyKey = config.sessionId + ':' + digest(stepId + '\n' + Object.values(fields).sort().join('\n'))
  const body: Record<string, unknown> = { key: config.key, sessionId: config.sessionId, idempotencyKey, fields }
  if (stepId) body.stepId = stepId
  // The attribute's value names the stream (1-64 chars); empty means the page path names it.
  const stream = (form.getAttribute(OPTIN_ATTR) ?? '').trim().slice(0, MAX_STREAM)
  if (stream) body.stream = stream
  send(config.endpoint.replace(/\/$/, '') + '/optin', JSON.stringify(body))
}

// Field names from the inputs' name attributes, lowercased; unnamed, disabled,
// unchecked, and empty inputs skipped. Hidden inputs carry tokens and plumbing,
// so they need data-tapt-field to be stored.
function readFields(form: HTMLFormElement): Payload {
  const out: Payload = {}
  let n = 0
  for (const el of Array.from(form.elements) as HTMLInputElement[]) {
    if (n >= MAX_FIELDS) break
    const name = (el.name ?? '').trim().toLowerCase().slice(0, MAX_FIELD_NAME)
    const type = (el.type ?? '').toLowerCase()
    if (!name || el.disabled || NEVER.has(type) || NOISE.has(type)) continue
    if (type === 'hidden' && !el.hasAttribute(FIELD_ATTR)) continue
    if ((type === 'checkbox' || type === 'radio') && !el.checked) continue
    const value = (el.value ?? '').trim()
    if (!value || name in out) continue // first of a shared name wins
    out[name] = value.slice(0, MAX_VALUE)
    n++
  }
  return out
}

// Synchronous 16-hex digest (two FNV-1a passes): a submit handler can't await
// crypto.subtle before a native submit navigates the page away.
function digest(s: string): string {
  const fnv = (seed: number) => {
    let h = seed >>> 0
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0
    return h.toString(16).padStart(8, '0')
  }
  return fnv(0x811c9dc5) + fnv(0x9747b28c)
}

// One id per tab session, so a visitor's actions group. sessionStorage is per
// tab and dies with it, which is exactly the lifetime we want.
function sessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY)
    if (existing && UUID_RE.test(existing)) return existing
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
