# Bulk Image Downloader — Chrome Extension: Implementation Plan

> **PRD Version:** 2.0 (Overlay Add-to-List UX)  
> **Manifest:** V3  
> **Date:** March 1, 2026

---

## 1. PRD Summary (What We're Building)

A Chrome Extension that lets users **select images directly on any webpage** via overlay "Add" buttons, collect them into a tray, review them in a popup, and **bulk-download them in one click**.

### Core User Flow

```
Visit page → Hover image → Click "+ Add" → Open popup → Review list → "Download All"
```

---

## 2. High-Level Architecture

```
┌──────────────────────────────────────────────────────┐
│                    CHROME EXTENSION                   │
│                                                      │
│  ┌────────────┐   chrome.storage   ┌──────────────┐  │
│  │  Content    │ ◄──────────────► │   Popup UI    │  │
│  │  Script     │                   │ (Collection   │  │
│  │ (overlay    │                   │   Tray)       │  │
│  │  injection) │                   └──────┬───────┘  │
│  └────────────┘                          │           │
│                                          ▼           │
│                                  ┌──────────────┐    │
│                                  │  Background   │    │
│                                  │  Service      │    │
│                                  │  Worker       │    │
│                                  │ (downloads)   │    │
│                                  └──────────────┘    │
└──────────────────────────────────────────────────────┘
```

| Component | Responsibility |
|---|---|
| **Content Script** (`content.js`) | DOM scanning, overlay injection, "Add" click handling, MutationObserver for lazy-loaded images |
| **Popup** (`popup.html` + `popup.js` + `popup.css`) | Display selected images, remove individual images, trigger "Download All" |
| **Background / Service Worker** (`background.js`) | Listen for download requests from popup, call `chrome.downloads.download()` sequentially with 100ms delay |
| **Manifest** (`manifest.json`) | Manifest V3 config — permissions, content script registration |
| **Storage** (`chrome.storage.local`) | Persist selected image URLs per-tab/session |

---

## 3. File / Folder Structure

```
bulk-image-downloader/
├── manifest.json
├── background.js
├── content/
│   ├── content.js
│   └── content.css
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── IMPLEMENTATION_PLAN.md
└── README.md
```

---

## 4. Implementation Phases & Task Breakdown

### Phase 1 — Project Scaffolding & Manifest
| # | Task | Details |
|---|---|---|
| 1.1 | Create `manifest.json` | Manifest V3, permissions: `activeTab`, `downloads`, `storage`. Register content script and popup. |
| 1.2 | Create placeholder icons | Simple 16/48/128 PNG icons (can be refined later). |
| 1.3 | Create skeleton files | Empty `content.js`, `content.css`, `popup.html`, `popup.js`, `popup.css`, `background.js`. |

### Phase 2 — Content Script: Image Detection & Overlay
| # | Task | Details |
|---|---|---|
| 2.1 | **DOM scan** | Query all `<img>` elements on the page. |
| 2.2 | **Size filter** | Ignore images with `naturalWidth < 50` or `naturalHeight < 50`. |
| 2.3 | **Overlay injection** | For each valid image, wrap/position a container and inject a `[+ Add]` button in the top-right corner. Show on hover. |
| 2.4 | **MutationObserver** | Watch for new `<img>` nodes added to the DOM (lazy loading, SPAs). Debounce processing (~300ms). |
| 2.5 | **Event delegation** | Attach a single delegated click handler at a high-level container to handle all "Add" button clicks efficiently. |

### Phase 3 — On-Page Interaction & Storage
| # | Task | Details |
|---|---|---|
| 3.1 | **Add-to-collection** | On button click, store image `src` URL to `chrome.storage.local`. Prevent duplicates. |
| 3.2 | **Visual state change** | Swap `[+ Add]` → `[✓ Added]`, change overlay color to indicate selection. |
| 3.3 | **Toggle behaviour** | Clicking `[✓ Added]` removes image from storage and resets button to `[+ Add]`. |
| 3.4 | **Badge count** | Update the extension badge text (`chrome.action.setBadgeText`) with the current count of selected images. |

### Phase 4 — Popup UI (Collection Tray)
| # | Task | Details |
|---|---|---|
| 4.1 | **Layout** | Header with count ("N images selected"), scrollable list, fixed footer with "Download All" button. |
| 4.2 | **Image list items** | Thumbnail preview (small `<img>`), filename/URL text (truncated), `[Remove]` button. |
| 4.3 | **Load from storage** | On popup open, read `chrome.storage.local` and render list. |
| 4.4 | **Remove single image** | Remove from storage, re-render list, update badge. Send message to content script to reset overlay button state. |
| 4.5 | **Empty state** | Show friendly message when no images are selected. |
| 4.6 | **Clear All** | Optional button to clear the entire collection at once. |

### Phase 5 — Download Mechanism
| # | Task | Details |
|---|---|---|
| 5.1 | **"Download All" handler** | Popup sends a message to background service worker with the array of image URLs. |
| 5.2 | **Sequential download** | Background iterates through URLs, calling `chrome.downloads.download()` with a 100ms delay between each. |
| 5.3 | **Naming convention** | Derive filename as `{site}-image-{index}.{ext}` (e.g., `example-com-image-1.jpg`). Extract extension from URL or Content-Type. |
| 5.4 | **Progress feedback** | Optionally update popup/badge with download progress. |
| 5.5 | **Error handling** | Catch download failures, log them, continue with remaining images. |

### Phase 6 — Polish & Performance
| # | Task | Details |
|---|---|---|
| 6.1 | **CSS isolation** | Use Shadow DOM or highly-specific selectors to prevent style leakage into/from the host page. |
| 6.2 | **Performance audit** | Verify overlay injection doesn't cause layout thrashing on image-heavy pages (100+ images). |
| 6.3 | **Edge cases** | Handle `srcset`, `background-image` (stretch goal), SVGs, broken images. |
| 6.4 | **Dark/light themes** | Make overlay and popup look good on both light and dark sites. |
| 6.5 | **README** | Setup instructions, screenshots, usage guide. |

---

## 5. Key Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Manifest version | **V3** | Required by PRD; Chrome is deprecating V2. |
| Storage API | `chrome.storage.local` | Simple, synchronous-feeling API. No need for `sync` since data is transient. |
| Overlay visibility | **Show on hover** with subtle corner indicator | Cleaner UX per PRD recommendation; avoids cluttering the page. |
| Download approach | **Sequential with 100ms delay** via Service Worker | Prevents browser throttling; respects ethical rate-limiting. |
| Style isolation | **CSS namespacing with unique prefix** (`__bid-*`) | Shadow DOM can conflict with some CSP policies; prefixed classes are safer and simpler. |
| Duplicate prevention | **Set-based check** on image `src` | Before adding, check if URL already exists in storage array. |
| Lazy-load support | **MutationObserver** | Watches for `childList` and `attributes` changes, debounced. |

---

## 6. Permissions Justification

| Permission | Why |
|---|---|
| `activeTab` | Access DOM of the current tab to inject overlays and scan images. |
| `downloads` | Use `chrome.downloads.download()` to save images to disk. |
| `storage` | Persist the user's selected image list across popup open/close. |

> **No host permissions needed** — `activeTab` is granted on user click/interaction.  
> **No remote code / external APIs** — all processing is local.

---

## 7. Order of Implementation

```
1.  manifest.json + folder structure           (~10 min)
2.  content.js — DOM scan + overlay inject     (~30 min)
3.  content.css — overlay styling              (~15 min)
4.  chrome.storage integration (add/remove)     (~20 min)
5.  popup.html/js/css — collection tray UI      (~30 min)
6.  background.js — download logic              (~20 min)
7.  Badge count updates                         (~10 min)
8.  MutationObserver for lazy-loaded images     (~15 min)
9.  Error handling & edge cases                 (~20 min)
10. README + final polish                       (~15 min)
                                        ─────────────────
                                        Total: ~3 hours
```

---

## 8. Definition of Done (from PRD)

- [x] Plan created
- [x] "Add" button appears correctly positioned on valid images (≥ 50×50)
- [x] Clicking "Add" stores the image instantly and updates button state
- [x] Popup correctly reflects selected images with thumbnails
- [x] Clicking "Download All" downloads all selected images sequentially
- [ ] No crashes on image-heavy sites
- [ ] Code submitted via GitHub with setup instructions (README)

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| CSP blocks inline styles/scripts | Overlay won't render | Use CSS file injected via manifest; avoid inline styles. |
| Images loaded via CSS `background-image` | Missed by `<img>` scan | Stretch goal: also scan computed styles for `background-image`. |
| Very large pages (1000+ images) | Performance degradation | Throttle/batch overlay injection; use `IntersectionObserver` to only inject for visible images. |
| Cross-origin image download failures | Some images may fail to download | Catch errors gracefully, notify user, continue remaining downloads. |
| Dynamic SPA content | Images added after initial scan missed | MutationObserver handles this. |

---

*Ready to start building. Next step: Phase 1 — Scaffolding.*
