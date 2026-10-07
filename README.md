# Sign in with ChatGPT — browser-only probe

An experimental static PWA testing authorization and inference directly from
the browser, without an application backend. Originally built for Apteronotus.

**Live:** https://0x53a.github.io/Sign-in-with-ChatGPT/

Select **Continue with ChatGPT**, then **Test inference** if authorization
completes. Diagnostics distinguish the static callback, token exchange,
identity verification and inference stages. Downloadable reports omit tokens,
authorization codes and identity values.

## Hosting and development

GitHub Pages serves prebuilt files from **main /docs**, with no Actions build.
The callback is a real `callback.html` file; no server routing is required.

```sh
npm ci
npm test
npm run build
npm run serve
```

Local preview: http://127.0.0.1:8766/index.html

Commit regenerated `docs/` files after source changes. The browser test uses
Chrome (`APTERONOTUS_CHROMIUM` overrides the executable) and a running preview:

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
Inference has not yet been tested in the PWA. The HTTPS deployment tests whether
the hosted origin behaves differently; it is not a claim of provider support.

Protocol tests cover PKCE, callback correlation, exact grants and completed
streamed responses. Chrome checks cover offline index/callback loading,
invalid callback rejection, query removal and absence of secrets in caches.
