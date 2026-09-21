import { useEffect, useState } from 'react';

/**
 * Hash routing, no router dependency.
 *
 *   #app        Core Editor (with optional `?doc=<id>` to open a local document)
 *   #dashboard  User portal (sign-in required)
 *   #admin      Admin dashboard (role = admin)
 *   (empty)     Landing placeholder
 *
 * Hash (not path) routing because GitHub Pages serves a static
 * `index.html` under /<repo>/ with no rewrite rules.
 */
export type RouteName = 'home' | 'app' | 'dashboard' | 'admin';

export interface Route {
  name: RouteName;
  params: URLSearchParams;
}

const KNOWN: ReadonlySet<string> = new Set(['app', 'dashboard', 'admin']);

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const q = raw.indexOf('?');
  const path = (q >= 0 ? raw.slice(0, q) : raw).replace(/\/+$/, '').toLowerCase();
  const params = new URLSearchParams(q >= 0 ? raw.slice(q + 1) : '');
  return { name: KNOWN.has(path) ? (path as RouteName) : 'home', params };
}

export function routeHref(name: RouteName, params?: Record<string, string>): string {
  if (name === 'home') return '#';
  const qs = params ? new URLSearchParams(params).toString() : '';
  return `#${name}${qs ? `?${qs}` : ''}`;
}

/** `replace` for redirects (guards), so Back does not bounce the user. */
export function navigate(name: RouteName, params?: Record<string, string>, replace = false): void {
  const href = routeHref(name, params);
  if (replace) {
    const url = new URL(window.location.href);
    url.hash = href === '#' ? '' : href;
    window.history.replaceState(window.history.state, '', url.toString());
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = href;
  }
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = (): void => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
