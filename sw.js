/* sw.js — CORS + COI + Range support patcher
 *
 * What it does:
 *  1. RANGE (206): requests carrying a `Range` header aimed at the CDN are
 *     answered by the worker itself. It fetches the full resource once
 *     (same-origin-side, cors/no-credentials), caches it, and slices the
 *     exact `bytes=start-end` window into a proper 206 + Content-Range
 *     response. The page never sends a cross-origin Range request, so CDN
 *     Range/CORS quirks (416s, preflights, stale edge caches) can't break
 *     micro-range loads.
 *  2. COI: document navigations get Cross-Origin-Opener/Embedder/Resource-
 *     Policy headers (cross-origin isolation), toggleable via ENABLE_COI.
 *  3. CORS: proxied range responses carry `Access-Control-Allow-Origin: *`;
 *     everything else passes through untouched.
 */

const CDN_ORIGIN = 'https://cdn.jsdelivr.net';
const CACHE_NAME = 'wo-range-cache-v1';
const MAX_CACHED_ENTRIES = 64; // ~64 parts * ~9MB before FIFO eviction
const ENABLE_COI = true;

self.addEventListener('install', function () {
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys
                .filter(function (key) { return key !== CACHE_NAME; })
                .map(function (key) { return caches.delete(key); }));
        }).then(function () { return self.clients.claim(); })
    );
});

self.addEventListener('fetch', function (event) {
    var request = event.request;
    if (request.method !== 'GET') return;

    var url;
    try { url = new URL(request.url); } catch (e) { return; }

    if (request.headers.has('range') && url.origin === CDN_ORIGIN) {
        event.respondWith(handleRange(request, url));
        return;
    }
    event.respondWith(passthrough(request));
});

/* ---- Range handling ---------------------------------------------------- */

async function handleRange(request, url) {
    var range = parseRange(request.headers.get('range') || '');
    if (!range) return fetch(request); // unsupported form: let the browser try

    var cache = await caches.open(CACHE_NAME);
    var full = await cache.match(url.href);
    if (!full) {
        var res = await fetch(url.href, { mode: 'cors', credentials: 'omit', redirect: 'follow' });
        if (!res.ok) return res;
        await trimCache(cache);
        // Cache one copy, slice from the other (bodies are single-use).
        cache.put(url.href, res.clone());
        full = res;
    }

    var total = Number((full.headers.get('content-range') || '').split('/')[1]) || 0;
    var buffer = await full.arrayBuffer();
    if (!total) total = buffer.byteLength;

    var start = range.start, end = range.end; // end inclusive
    if (start === null) {                     // suffix form: bytes=-N
        start = Math.max(0, total - end);
        end = total - 1;
    } else if (end === null || end >= total) {
        end = total - 1;
    }
    if (start >= total || start > end) {
        return new Response(null, {
            status: 416,
            headers: { 'Content-Range': 'bytes */' + total }
        });
    }

    return new Response(buffer.slice(start, end + 1), {
        status: 206,
        statusText: 'Partial Content',
        headers: {
            'Content-Type': full.headers.get('content-type') || 'application/octet-stream',
            'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
            'Content-Length': String(end - start + 1),
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*'
        }
    });
}

function parseRange(header) {
    var m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!m || (m[1] === '' && m[2] === '')) return null;
    if (m[1] === '') return { start: null, end: parseInt(m[2], 10) }; // suffix
    return { start: parseInt(m[1], 10), end: m[2] === '' ? null : parseInt(m[2], 10) };
}

async function trimCache(cache) {
    var keys = await cache.keys();
    while (keys.length >= MAX_CACHED_ENTRIES) {
        var oldest = keys.shift();
        await cache.delete(oldest);
    }
}

async function passthrough(request) {
    var res = await fetch(request);
    if (ENABLE_COI && request.mode === 'navigate') {
        var headers = new Headers(res.headers);
        headers.set('Cross-Origin-Opener-Policy', 'same-origin');
        headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
        headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
        return new Response(res.body, { status: res.status, statusText: res.statusText, headers: headers });
    }
    return res;
}
