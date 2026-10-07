# Sign in with ChatGPT — browser-only probe

An experimental static PWA testing authorization and inference directly from
the browser, without an application backend.

**Live:** https://0x53a.github.io/Sign-in-with-ChatGPT/

Select **Continue with ChatGPT**, then **Test inference** if authorization
completes. Diagnostics distinguish the static callback, token exchange,
identity verification and inference stages. Downloadable reports omit tokens,
authorization codes and identity values.

## Hosting and development

GitHub Actions installs locked dependencies, runs protocol and browser tests, builds
the static app into `dist/`, and deploys that artifact to GitHub Pages on pushes
to `main`. Pull requests run the same checks without deploying.
The callback is a real `callback.html` file; no server routing is required.

```sh
npm ci
npm test
npm run build
npm run serve
```

Local preview: http://127.0.0.1:8766/index.html

Source is in `src/` (browser logic) and `public/` (HTML, CSS and assets).
`build.mjs` bundles the app and generates its service worker and static callback.
Generated `dist/` files are not committed. The browser test uses
Chrome (`CHROMIUM` overrides the executable) and a running preview:

```sh
npm run test:browser
```

## Authorization and storage

Requests exactly `openid resource.invoke chatgpt.tokens.use.direct`, with
PKCE S256, state and nonce. No email, profile or offline_access scope.
Access tokens live only in page memory; there is no refresh token. Signed
identity tokens are verified then discarded. Browser storage contains client
registration IDs, a pending PKCE transaction and sanitized diagnostic events.
Forgetting a token locally does not revoke the provider grant.

The service worker caches a fixed list of local assets only, never API requests
or callback query strings. The shell works offline; login and inference require
network access. Dependencies are bundled locally with no runtime CDN.

## Results so far — 7 October 2026

On localhost, real user sign-in, static callback and browser token exchange
succeeded, returning precisely the requested scopes with no refresh token.
Identity verification then failed. Separate Chrome checks identified
`MissingAllowOriginHeader` CORS errors on discovery and signing-key requests.
On GitHub Pages, OpenAI rejected the HTTPS callback before sign-in with
`invalid_authorize_request`, parameter `redirect_uri`. Discovery and signing-key
requests also failed with `MissingAllowOriginHeader` from that HTTPS origin.
Inference remains untested in the PWA. This is a reproducible compatibility
probe, not a working or officially endorsed browser integration.

Protocol tests cover PKCE, callback correlation, exact grants and completed
streamed responses. Chrome checks cover offline index/callback loading,
invalid callback rejection, query removal and absence of secrets in caches.
