# @tapt/sdk

The tracking SDK for [tapt](https://tapt.so).

tapt builds and serves funnels from one place, with every action tracked live. This package is how a funnel built outside tapt gets its events in: an npm package for codebases, with a script snippet and a server-side events API alongside it.

`npx @tapt/sdk` connects a project to a tapt Site today: it opens tapt.so/connect, you authorize, it hands back the Site's key. Install and the snippet come next.

```sh
npx @tapt/sdk
```

Docs live at [docs.tapt.so](https://docs.tapt.so).

MIT.
