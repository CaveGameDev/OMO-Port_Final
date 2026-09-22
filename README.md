# OMO-Port_Final

A self-contained browser port of OMORI (RPG Maker MV) built with a custom
canvas2d runtime and a static-file asset pipeline. No CDN required — every
asset ships with the app and it runs from any plain static file server.

## Running

Serve this folder with any static file server, then open `index.html`:

```bash
python -m http.server 8099
# then visit http://127.0.0.1:8099/index.html
```

First launch unpacks the asset packs into browser storage (roughly 1.6 GB of
downloaded data, cached for later visits). After that, boots are local.

## Layout

| Path | Contents |
| --- | --- |
| `index.html` | Entry point, launcher UI, boot-check overlay, mobile controls |
| `game.canvas2d.js` | Compiled canvas2d game runtime (RPG Maker MV + OMORI plugins) |
| `js/plugins.bundle.js` | Plugin bundle loaded by the runtime |
| `data.zip.js`, `maps.zip.js`, `languages.zip.js` | Base64 fallback archives, used when the raw zip can't be served |
| `img_pack/`, `aud_pack/` | Sharded image/audio archives (`.partNN`) + repk range maps |
| `movies/`, `fonts/`, `icon/` | Videos, fonts, app icon |
| `MOD/` | Community mod list loaded at boot |
| `sw.js` | Service worker: Range-request + cross-origin-isolation patches |
| `base.ini` | Loader configuration (baseUrl, caching, concurrency) |

## Notes

- Mods and saves can be managed from the launcher UI (`.zip` mods, `.rpgsave` saves).
- `data.zip.js` / `maps.zip.js` are generated fallbacks; delete them if your
  host serves `data.zip` / `maps.zip` directly.
