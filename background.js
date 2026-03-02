/* ==========================================================
   Bulk Image Downloader — Background Service Worker
   Handles badge updates and sequential file downloads
   ========================================================== */

// ── Badge updates ────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "UPDATE_BADGE") {
    const count = msg.count || 0;
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
    return;
  }

  if (msg.type === "DOWNLOAD_ALL") {
    downloadAll(msg.urls, sender)
      .then((results) => sendResponse({ success: true, results }))
      .catch((err) => {
        console.error("[BID] Download error:", err);
        sendResponse({ success: false, error: err.message });
      });

    // Return true to indicate we'll call sendResponse asynchronously
    return true;
  }
});

// ── Sequential download with 100ms delay ─────────────────

async function downloadAll(urls) {
  if (!urls || urls.length === 0) return [];

  const siteName = await getSiteName();
  const results = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const ext = getExtension(url);
    const filename = `${siteName}-image-${i + 1}${ext}`;

    // Broadcast progress to popup
    broadcastProgress(i + 1, urls.length, url, "downloading");

    try {
      await chrome.downloads.download({ url, filename });
      results.push({ url, success: true });
      broadcastProgress(i + 1, urls.length, url, "done");
    } catch (err) {
      console.warn(`[BID] Failed to download ${url}:`, err);
      results.push({ url, success: false, error: err.message });
      broadcastProgress(i + 1, urls.length, url, "failed");
      // Continue with remaining downloads
    }

    // Rate-limit: 100ms delay between downloads
    if (i < urls.length - 1) {
      await delay(100);
    }
  }

  // Final broadcast
  broadcastProgress(urls.length, urls.length, null, "complete");
  return results;
}

/** Send progress updates to any open popup */
function broadcastProgress(current, total, url, status) {
  chrome.runtime.sendMessage({
    type: "DOWNLOAD_PROGRESS",
    current,
    total,
    url,
    status,
  }).catch(() => {
    // Popup may not be open — ignore
  });
}

// ── Helpers ──────────────────────────────────────────────

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getExtension(url) {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.(\w+)$/);
    if (match) {
      const ext = match[1].toLowerCase();
      const valid = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "avif"];
      if (valid.includes(ext)) return `.${ext}`;
    }
  } catch {
    // ignore
  }
  return ".jpg"; // default fallback
}

async function getSiteName() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      const hostname = new URL(tab.url).hostname;
      return hostname.replace(/^www\./, "").replace(/\./g, "-");
    }
  } catch {
    // ignore
  }
  return "site";
}

// ── Restore badge on service worker startup ──────────────

chrome.storage.local.get({ selectedImages: [] }, ({ selectedImages }) => {
  const count = selectedImages.length;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
});
