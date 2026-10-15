# @tapt/sdk

The tracking SDK for [tapt](https://tapt.so).

tapt builds and serves funnels from one place, with every action tracked live. This package is how a funnel built outside tapt gets its events in: an npm package for codebases, with a script snippet and a server-side events API alongside it.

`npx @tapt/sdk` connects a project to a tapt Site: it opens tapt.so/connect, you authorize, it hands back the Site's key.

```sh
npx @tapt/sdk
```

Then in the site, bundled with the rest of your code:

```ts
import { init, track } from '@tapt/sdk'

// endpoint is your own path that forwards to e.tapt.online; page_viewed fires here.
init({ key: 'pk_...', endpoint: '/api/t' })

track('clicked', { cta: 'book-a-call' })
```

Events are posted as text/plain with keepalive, and by sendBeacon when the page is closing. Types: page_viewed, page_left, clicked, submitted.

Docs live at [docs.tapt.so](https://docs.tapt.so).

MIT.
