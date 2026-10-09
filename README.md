# Anchors Arcade X

> A browser-style web platform for games, media, and customization — with a dark aurora identity.

[![License: PL v1.0](https://img.shields.io/badge/License-Plutonium%20License%20v1.0-7C5CFF)](LICENSE)

Anchors Arcade X is a **fully static website**: no build step, no Node, no npm, no database. Upload the files to any static host (GitHub Pages works out of the box) and it runs.

> **Attribution notice.** Anchors Arcade X is an unofficial, independently modified build of [Plutonium](https://github.com/Plutonium-Net/Plutonium), the open-source platform by [Plutonium-Net](https://github.com/Plutonium-Net). It is **not** the official Plutonium project and is not affiliated with or endorsed by Plutonium-Net or the original developers. All credit for the underlying platform goes to them. See [Credits](#credits--attribution) and [LICENSE](LICENSE).

## Features

* **Games** — a built-in game library, playable directly in the platform
* **Browser** — browser-style tabs with built-in browsing engines
* **AI assistant** — the Stelena AI helper (branded here as Anchors AI)
* **Cloud gaming & VMs** — remote desktop and cloud gaming embeds
* **Media** — apps, media and streaming surfaces
* **Customization** — themes, accents, wallpapers, workspaces
* **Accounts** — optional sign-in with cross-device sync
* **PWA** — installable, works offline for the app shell

## Deploy to GitHub Pages

The whole site is static and uses relative paths throughout, so it works at the repository root (`user.github.io`) and inside a subpath (`user.github.io/repo/`).

1. Create a new GitHub repository.
2. Upload **all** files from this folder to the repository (see the size note below — the GitHub web uploader may struggle; `git` handles it fine).
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose your branch (e.g. `main`) and the `/ (root)` folder, then **Save**.
5. Your site is live at `https://<user>.github.io/<repo>/` within a few minutes.

To test locally, serve the folder with any static server, e.g.:

```bash
python3 -m http.server 8080
```

then open `http://localhost:8080`. Opening `index.html` directly with `file://` is not supported (service workers and fetches need a real server).

### Repository size note

This project is roughly **650 MB / 765 files**, dominated by background wallpapers and game assets. Every individual file is well under GitHub's 100 MB hard limit, so a normal `git push` works — but expect the initial push to take a while, and avoid re-committing the large asset folders unnecessarily. If you want a lean deployment, most of the size is optional wallpaper imagery.

### Services that need a backend

The site itself is static, but some features talk to services that this build does **not** operate — they are inherited from the original project's infrastructure and may change or stop working at any time:

| Feature | Depends on |
| --- | --- |
| Accounts & sync | Firebase-based auth/store worker (original project's infrastructure) |
| Anchors AI (Stelena) | Groq AI worker |
| Browsing engines (Core/UV, Runtime/Scramjet) | wisp relay servers |
| Cloud gaming & VMs | Hyperbeam |
| Presence, announcements, build notices | Original project's config/feed endpoints |

Games, tabs, themes, workspaces, and personal games (stored locally) work without any backend. This is a limitation of a static deployment, documented rather than removed.

## Known limitations

* **Social previews**: `og:image` uses a relative path so the build stays subpath-portable; some social platforms resolve relative preview URLs poorly. If you care about link previews, replace `img/brand-logo.png` in the `og:image`/`twitter:image` tags in `index.html` with an absolute URL.
* **Personal games + subpaths**: the `pg-game` viewer route is resolved relative to the app root and matched subpath-aware by the service worker, so it works both at a domain root and inside a repository subpath.

## Credits & attribution

* **Original project**: [Plutonium](https://github.com/Plutonium-Net/Plutonium) — the browser-style platform this build is based on. Created by Crafted, Mizzery, and Blake181041 ([Plutonium-Net](https://github.com/Plutonium-Net)).
* **Special thanks**: Titanium Network.
* **License**: [Plutonium License (PL) v1.0](LICENSE) — modifications are permitted with attribution and a distinguishable name, which this build provides.
* Third-party assets, libraries, and services remain subject to their respective licenses and terms.

## License

This project is distributed under the [Plutonium License (PL) v1.0](LICENSE). The original software is © 2026 Plutonium-Net; modifications for Anchors Arcade X © 2026 the Anchors Arcade X maintainers. Neither this build nor its name implies endorsement by Plutonium-Net.
