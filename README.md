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

To store what a visitor submits, mark the form. Only marked forms are captured; the value names the stream.

```html
<form data-tapt-optin="free-class">
  <input name="email" type="email" />
  <input name="csrf" type="hidden" />  <!-- hidden inputs are skipped unless marked data-tapt-field -->
  <button>Claim seat</button>
</form>
```

Field names come from the inputs' name attributes, lowercased. Password and file inputs are never captured. The record posts to your endpoint plus `/optin`, so your forward route passes that sub-path through too, and the ingest emits the journey's submitted event itself. Unmarked forms are untouched.

`getSessionId()` returns the per-tab session id after init, for joining your own server-side records to the journey.

On localhost nothing is sent and nothing is captured, so dev runs never land in a Site's live data. Pass `debug: true` to init to override that when you need to test against the live ingest.

Docs live at [docs.tapt.so](https://docs.tapt.so).

MIT.
