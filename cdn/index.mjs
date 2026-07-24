/*
 * Copyright 2022 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

'use strict';

const getExtension = (path) => {
  const basename = path.split('/').pop();
  const pos = basename.lastIndexOf('.');
  return (basename === '' || pos < 1) ? '' : basename.slice(pos + 1);
};

const isMediaRequest = (url) => /\/media_[0-9a-f]{40,}[/a-zA-Z0-9_-]*\.[0-9a-z]+$/.test(url.pathname);
const isRUMRequest = (url) => /\/\.(rum|optel)\/.*/.test(url.pathname);

const PREVIEW_COOKIE = 'stardust_preview';

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

const unlockPage = (host, { error = false, redirect = '/' } = {}) => new Response(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Private preview · ${escapeHtml(host)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { min-height: 100vh; display: grid; place-items: center; background: #f2f2f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #17191d; padding: 24px; }
  .card { background: #fff; border-radius: 12px; padding: 40px 36px; max-width: 380px; width: 100%; box-shadow: 0 12px 32px rgba(23,25,29,.08); }
  .chip { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; border-radius: 4px; padding: 3px 9px; background: #FF642D; margin-bottom: 14px; }
  h1 { font-size: 22px; letter-spacing: -.01em; margin-bottom: 6px; }
  .host { font-size: 14px; color: #555a62; margin-bottom: 22px; overflow-wrap: anywhere; }
  label { display: block; font-size: 13px; font-weight: 700; margin-bottom: 6px; }
  input[type="text"] { width: 100%; font-size: 22px; letter-spacing: .12em; font-variant-numeric: tabular-nums; padding: 10px 12px; border: 1.5px solid #c9ccd1; border-radius: 8px; }
  input[type="text"]:focus { outline: 2px solid #FF642D; outline-offset: 1px; border-color: #FF642D; }
  .error { color: #b3261e; font-size: 13px; margin-top: 8px; }
  button { margin-top: 16px; width: 100%; background: #FF642D; color: #17191d; font-size: 16px; font-weight: 800; border: 0; border-radius: 999px; padding: 13px; cursor: pointer; }
  button:hover { filter: brightness(.96); }
  .note { margin-top: 14px; font-size: 12.5px; color: #6a7079; line-height: 1.5; }
</style>
</head>
<body>
<main class="card">
  <p class="chip">Private preview</p>
  <h1>This preview is not public</h1>
  <p class="host">${escapeHtml(host)}</p>
  <form method="post" action="/__preview/unlock">
    <input type="hidden" name="redirect" value="${escapeHtml(redirect)}">
    <label for="passkey">Enter your 8-digit passkey</label>
    <input type="text" id="passkey" name="passkey" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{8}" maxlength="8" placeholder="••••••••" required autofocus>
    ${error ? '<p class="error">That passkey didn&rsquo;t match. Please try again.</p>' : ''}
    <button type="submit">Open the preview</button>
  </form>
  <p class="note">The passkey is in the email we sent you. You&rsquo;ll only be asked once in this browser.</p>
</main>
</body>
</html>`, {
  status: error ? 403 : 401,
  headers: {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-robots-tag': 'noindex, nofollow',
  },
});

// Private-preview gate: when PREVIEW_PASSKEY is set, everything except
// robots.txt requires the passkey once per browser (long-lived cookie).
// Returns a Response to short-circuit the request, or null to let it through.
const previewGate = async (request, url, env) => {
  if (!env.PREVIEW_PASSKEY || url.pathname === '/robots.txt') return null;
  const host = request.headers.get('host') || url.hostname;
  if (url.pathname === '/__preview/unlock') {
    if (request.method !== 'POST') {
      return new Response('Moved permanently to /', { status: 301, headers: { location: '/' } });
    }
    const form = await request.formData();
    const passkey = String(form.get('passkey') || '').replace(/\D/g, '');
    let redirect = String(form.get('redirect') || '/');
    if (!redirect.startsWith('/') || redirect.startsWith('//')) redirect = '/';
    if (passkey !== env.PREVIEW_PASSKEY) return unlockPage(host, { error: true, redirect });
    return new Response(null, {
      status: 303,
      headers: {
        location: redirect,
        'set-cookie': `${PREVIEW_COOKIE}=${env.PREVIEW_PASSKEY}; Path=/; Max-Age=31536000; Secure; HttpOnly; SameSite=Lax`,
      },
    });
  }
  const cookies = request.headers.get('cookie') || '';
  const unlocked = cookies.split(/;\s*/).includes(`${PREVIEW_COOKIE}=${env.PREVIEW_PASSKEY}`);
  return unlocked ? null : unlockPage(host, { redirect: url.pathname + url.search });
};


const handleRequest = async (request, env, ctx) => {
  const url = new URL(request.url);
  if (url.port) {
    // Cloudflare opens a couple more ports than 443, so we redirect visitors
    // to the default port to avoid confusion. 
    // https://developers.cloudflare.com/fundamentals/reference/network-ports/#network-ports-compatible-with-cloudflares-proxy
    const redirectTo = new URL(request.url);
    redirectTo.port = '';
    return new Response('Moved permanently to ' + redirectTo.href, {
      status: 301,
      headers: {
        location: redirectTo.href
      }
    });
  }

  // EDS paths never end in '/': 301 trailing-slash variants to the canonical path
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    const to = new URL(request.url);
    to.pathname = to.pathname.replace(/\/+$/, '');
    return new Response('Moved permanently to ' + to.href, {
      status: 301,
      headers: { location: to.href },
    });
  }

  if (url.pathname.startsWith('/drafts/')) {
    return new Response('Not Found', { status: 404 });
  }

  const gated = await previewGate(request, url, env);
  if (gated) return gated;

  // demo-domain crawl gate: ROBOTS=disallow blocks crawlers again after the audit window
  if (url.pathname === '/robots.txt' && env.ROBOTS === 'disallow') {
    return new Response('User-agent: *\nDisallow: /\n', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  if(isRUMRequest(url)) {
    // only allow GET, POST, OPTIONS
    if(!['GET', 'POST', 'OPTIONS'].includes(request.method)) {
      return new Response('Method Not Allowed', { status: 405 });
    }
  }

  const extension = getExtension(url.pathname);

  // remember original search params
  const savedSearch = url.search;

  // sanitize search params
  const { searchParams } = url;
  if (isMediaRequest(url)) {
    for (const [key] of searchParams.entries()) {
      if (!['format', 'height', 'optimize', 'width'].includes(key)) {
        searchParams.delete(key);
      }
    }
  } else if (extension === 'json') {
    for (const [key] of searchParams.entries()) {
      if (!['limit', 'offset', 'sheet'].includes(key)) {
        searchParams.delete(key);
      }
    }
  } else {
    // neither media nor json request: strip search params
    url.search = '';
  }
  searchParams.sort();
  
  url.hostname = env.ORIGIN_HOSTNAME;
  if (!url.origin.match(/^https:\/\/main--.*--.*\.(?:aem|hlx)\.live/)) {
    return new Response('Invalid ORIGIN_HOSTNAME', { status: 500 });
  }
  const req = new Request(url, request);
  req.headers.set('x-forwarded-host', req.headers.get('host'));
  req.headers.set('x-byo-cdn-type', 'cloudflare');
  if (env.PUSH_INVALIDATION !== 'disabled') {
    req.headers.set('x-push-invalidation', 'enabled');
  }
  if (env.ORIGIN_AUTHENTICATION) {
    req.headers.set('authorization', `token ${env.ORIGIN_AUTHENTICATION}`);
  }
  // While the audit window is open (ROBOTS=allow) bypass the edge cache so
  // crawlers always see the freshest origin content; normal mode caches everything.
  const cfOpts = env.ROBOTS === 'allow'
    ? { cacheTtl: 0, cacheEverything: false }
    : { cacheEverything: true };
  let resp = await fetch(req, {
    method: req.method,
    cf: cfOpts,
  });
  resp = new Response(resp.body, resp);
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('text/html')) {
    const LOCALES = ['de', 'el', 'es', 'fr', 'hi', 'hu', 'it', 'ja', 'nl'];
    const seg = url.pathname.split('/')[1];
    const lang = LOCALES.includes(seg) ? seg : 'en';
    resp = new HTMLRewriter().on('html', {
      element(el) { el.setAttribute('lang', lang); },
    }).transform(resp);
  }
  if (resp.status === 301 && savedSearch) {
    const location = resp.headers.get('location');
    if (location && !location.match(/\?.*$/)) {
      resp.headers.set('location', `${location}${savedSearch}`);
    }
  }
  if (resp.status === 304) {
    // 304 Not Modified - remove CSP header
    resp.headers.delete('Content-Security-Policy');
  }
  resp.headers.delete('age');
  if (env.ROBOTS === 'disallow') {
    resp.headers.set('x-robots-tag', 'noindex, nofollow');
  } else {
    resp.headers.delete('x-robots-tag');
  }
  return resp;
};

export default {
  fetch: handleRequest,
};
