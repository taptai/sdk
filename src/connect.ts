// `npx @tapt/sdk` — connect this project to a tapt Site. The device-login shape:
// the CODE IS MINTED HERE (120 bits), the browser opens tapt.so/connect carrying
// it, the operator authorizes on that page, and this process polls until the app
// answers with the Site's key. Polling, not a localhost callback, so it works
// from a sandbox or over SSH where the browser can't reach this machine.
//
// The poll contract (the app's side lands next): GET /api/connect/<code>
//   404  the app hasn't heard of this code — it's minted here, stored on
//        Authorize — so 404 means WAITING, never an error
//   200  { key, site, workspace }  authorized
//   410  denied or expired on the app's side
// Node-only (crypto, fs, child_process): the library entry never imports this.

import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

// TAPT_ORIGIN overrides for a dev app (http://localhost:3000).
const ORIGIN = process.env.TAPT_ORIGIN ?? 'https://tapt.so'
const TIMEOUT_MS = 10 * 60 * 1000
const POLL_MS = 2000

// Crockford base32, lowercase: no i/l/o/u, so the code reads cleanly by eye.
// 256 % 32 === 0, so byte % 32 is unbiased. 24 chars × 5 bits = 120 bits.
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'
function mintCode(): string {
  return Array.from(randomBytes(24), (b) => ALPHABET[b % 32]).join('')
}
// What the human compares: the page shows the same 8 characters, so a tab that
// wasn't opened by THIS terminal can't be authorized by mistake.
const display = (code: string) => `${code.slice(0, 4)}-${code.slice(4, 8)}`

// A name for the Site, as a hint the page prefills: package.json's name (sans
// scope), else the folder.
async function projectName(): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile('package.json', 'utf8')) as { name?: unknown }
    if (typeof pkg.name === 'string' && pkg.name) return pkg.name.replace(/^@[^/]+\//, '')
  } catch {
    // no package.json — not every site is a node project
  }
  return basename(process.cwd())
}

// Best effort, never fatal: the URL is printed regardless. Windows goes through
// url.dll so a query string survives (cmd's `start` would split on `&`).
function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]]
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' })
    child.on('error', () => {}) // ENOENT arrives as an event, not a throw
    child.unref()
  } catch {
    // headless — the printed URL is the fallback
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

type Authorized = { key: string; site: string; workspace: string }

async function poll(code: string): Promise<Authorized | 'expired'> {
  const deadline = Date.now() + TIMEOUT_MS
  let unreachableNoted = false
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${ORIGIN}/api/connect/${code}`, { headers: { accept: 'application/json' } })
      if (res.status === 200) return (await res.json()) as Authorized
      if (res.status === 410) return 'expired'
      // 404 (and anything else): still waiting.
    } catch {
      // The app may be asleep or deploying; say so once, keep waiting.
      if (!unreachableNoted) {
        unreachableNoted = true
        process.stdout.write(`\n  ${ORIGIN} isn't answering yet — still waiting\n`)
      }
    }
    await sleep(POLL_MS)
  }
  return 'expired'
}

export async function connect(): Promise<number> {
  const code = mintCode()
  const name = await projectName()
  const url = `${ORIGIN}/connect?code=${code}&name=${encodeURIComponent(name)}`

  const out = process.stdout
  out.write('\n')
  out.write(`  Connecting  ${name}\n`)
  out.write(`  Open        ${url}\n`)
  out.write(`  Code        ${display(code)}   match it on the page\n\n`)
  openBrowser(url)

  // A quiet clock while we wait (TTY only — logs don't get a carriage-return dance).
  const started = Date.now()
  const tick = out.isTTY
    ? setInterval(() => {
        const s = Math.floor((Date.now() - started) / 1000)
        out.write(`\r  Waiting for you to authorize  ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)
      }, 1000)
    : null
  const result = await poll(code)
  if (tick) clearInterval(tick)
  out.write('\r' + ' '.repeat(48) + '\r')

  if (result === 'expired') {
    out.write('  No answer in 10 minutes. Run it again when you\'re ready.\n\n')
    return 1
  }
  out.write(`  Connected   ${result.site} in ${result.workspace}\n`)
  out.write(`  Key         ${result.key}\n`)
  // Writing the key into the project is the next version's job.
  out.write('  Keep the key; the next version writes it into your project for you.\n\n')
  return 0
}
