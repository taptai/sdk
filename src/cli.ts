#!/usr/bin/env node
// `npx @tapt/sdk` — the bin. Today it says the one true thing and exits clean.
// Later this is init: link a workspace, install the package, drop the snippet.

import { VERSION } from './index.js'

const line = `tapt sdk ${VERSION}: not live yet. Follow tapt.so`
process.stdout.write(line + '\n')
process.exit(0)
