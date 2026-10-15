#!/usr/bin/env node
// `npx @tapt/sdk` — the bin. One verb today, and it's the default: connect this
// project to a tapt Site (src/connect.ts). Install and the snippet come after.

import { VERSION } from './index.js'
import { connect } from './connect.js'

const HELP = `tapt sdk ${VERSION}

  npx @tapt/sdk              connect this project to a tapt Site
  npx @tapt/sdk --version
  npx @tapt/sdk --help

  TAPT_ORIGIN                point at a dev app (default https://tapt.so)
`

const [verb = 'connect'] = process.argv.slice(2)

if (verb === '--version' || verb === '-v') {
  process.stdout.write(VERSION + '\n')
  process.exit(0)
}
if (verb === '--help' || verb === '-h' || verb === 'help') {
  process.stdout.write(HELP)
  process.exit(0)
}
if (verb !== 'connect') {
  process.stderr.write(`tapt: unknown command "${verb}"\n\n` + HELP)
  process.exit(2)
}

process.exit(await connect())
