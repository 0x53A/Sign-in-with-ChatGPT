// Run before loading the app or subresources. Keep callback values only in
// memory, and remove the one-time authorization result from browser history.
(() => {
  const url = new URL(location.href);
  if (url.searchParams.has('code') || url.searchParams.has('error')) {
    window.apteronotusOAuthArrival = url.search;
    history.replaceState(null, '', url.pathname);
  }
})();
