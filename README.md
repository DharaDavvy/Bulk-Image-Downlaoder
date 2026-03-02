# Bulk Image Downloader — Chrome Extension

> Select images directly on any webpage and download them all in one click.

![Chrome](https://img.shields.io/badge/Chrome-Manifest_V3-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

- **On-page overlay buttons** — hover over any image to see a `+ Add` button
- **Smart filtering** — automatically ignores tiny icons (< 50×50 px)
- **Collection tray** — review all selected images in the extension popup
- **Bulk download** — download everything with a single click
- **Lazy-load support** — detects images loaded dynamically via `MutationObserver`
- **No external servers** — all processing happens locally in your browser

---

## Installation (Developer Mode)

1. **Clone or download** this repository:
   ```bash
   git clone https://github.com/your-username/bulk-image-downloader.git
   ```

2. Open **Google Chrome** and go to:
   ```
   chrome://extensions
   ```

3. Enable **Developer mode** (toggle in the top-right corner).

4. Click **"Load unpacked"** and select the `bulk-image-downloader` folder.

5. The extension icon will appear in your toolbar. **Pin it** for easy access.

---

## Usage

1. **Navigate** to any webpage with images.
2. **Hover** over an image — a blue `+ Add` button appears in the top-right corner.
3. **Click** `+ Add` to collect the image. The button turns green (`✓ Added`).
4. **Click the extension icon** in the toolbar to open the collection tray.
5. **Review** your selected images (remove any you don't want).
6. **Click "Download All"** — images download sequentially to your default downloads folder.

---

## File Structure

```
bulk-image-downloader/
├── manifest.json          # Extension manifest (V3)
├── background.js          # Service worker — handles downloads
├── content/
│   ├── content.js         # DOM scanning, overlay injection
│   └── content.css        # Overlay button styles
├── popup/
│   ├── popup.html         # Collection tray UI
│   ├── popup.js           # Popup logic
│   └── popup.css          # Popup styles
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── IMPLEMENTATION_PLAN.md # Detailed build plan
└── README.md              # This file
```

---

## Permissions

| Permission | Purpose |
|---|---|
| `activeTab` | Access the current tab's DOM to scan images and inject overlays |
| `downloads` | Save images to disk via `chrome.downloads` API |
| `storage` | Persist selected image list across popup open/close |

No data is sent to any external server. Everything runs locally.

---

## Technical Notes

- **Manifest V3** — uses a service worker instead of a background page
- **MutationObserver** — watches for dynamically added images (lazy loading, SPAs)
- **Rate-limited downloads** — 100ms delay between each download to avoid browser throttling
- **CSS scoping** — all injected styles use a `__bid-` prefix to avoid conflicts with host pages
- **Event delegation** — single click handler for all overlay buttons (efficient on image-heavy pages)

---

## License

MIT — free for personal and commercial use.
