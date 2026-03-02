/* ==========================================================
   Bulk Image Downloader — Content Script
   Scans <img> elements, injects overlay "Add" buttons,
   stores selections in chrome.storage.local
   ========================================================== */

(() => {
  "use strict";

  const MIN_SIZE = 50; // Ignore images smaller than 50×50
  const OVERLAY_ATTR = "data-bid-overlay"; // Marks processed images
  const DEBOUNCE_MS = 300;

  let debounceTimer = null;

  // ── Helpers ──────────────────────────────────────────────

  /** Extract a clean display filename from a URL */
  function getFilename(url) {
    try {
      const pathname = new URL(url).pathname;
      const segments = pathname.split("/");
      return segments[segments.length - 1] || "image";
    } catch {
      return "image";
    }
  }

  /** Parse srcset and return the highest-resolution URL */
  function getBestSrcFromSrcset(srcset) {
    if (!srcset) return null;
    try {
      const candidates = srcset.split(",").map((entry) => {
        const parts = entry.trim().split(/\s+/);
        const url = parts[0];
        const descriptor = parts[1] || "1x";
        // Parse width (e.g. "800w") or pixel density (e.g. "2x")
        const value = parseFloat(descriptor) || 1;
        return { url, value };
      });
      candidates.sort((a, b) => b.value - a.value);
      return candidates[0]?.url || null;
    } catch {
      return null;
    }
  }

  /** Get the best available URL for an image (prefers srcset highest-res) */
  function getBestImageUrl(img) {
    const srcsetUrl = getBestSrcFromSrcset(img.getAttribute("srcset"));
    if (srcsetUrl && srcsetUrl.startsWith("http")) return srcsetUrl;
    // Also check <picture> > <source> parent
    const picture = img.closest("picture");
    if (picture) {
      const sources = picture.querySelectorAll("source[srcset]");
      for (const source of sources) {
        const best = getBestSrcFromSrcset(source.getAttribute("srcset"));
        if (best && best.startsWith("http")) return best;
      }
    }
    return img.src;
  }

  /** Check if an image meets the minimum size threshold */
  function isValidImage(img) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    return w >= MIN_SIZE && h >= MIN_SIZE && getBestImageUrl(img)?.startsWith("http");
  }

  // ── Storage helpers ─────────────────────────────────────

  async function getStoredImages() {
    const data = await chrome.storage.local.get({ selectedImages: [] });
    return data.selectedImages;
  }

  async function addImage(url) {
    const images = await getStoredImages();
    if (images.includes(url)) return images;
    images.push(url);
    await chrome.storage.local.set({ selectedImages: images });
    updateBadge(images.length);
    return images;
  }

  async function removeImage(url) {
    let images = await getStoredImages();
    images = images.filter((u) => u !== url);
    await chrome.storage.local.set({ selectedImages: images });
    updateBadge(images.length);
    return images;
  }

  function updateBadge(count) {
    chrome.runtime.sendMessage({ type: "UPDATE_BADGE", count });
  }

  // ── Overlay injection ──────────────────────────────────

  function injectOverlay(img) {
    if (img.hasAttribute(OVERLAY_ATTR)) return;
    if (!isValidImage(img)) return;

    img.setAttribute(OVERLAY_ATTR, "true");

    // Wrapper — needed to position the overlay relative to the image
    const wrapper = document.createElement("div");
    wrapper.className = "__bid-wrapper";

    // Copy certain styles from the image so layout stays intact
    const computed = window.getComputedStyle(img);
    wrapper.style.display = computed.display === "inline" ? "inline-block" : computed.display;
    wrapper.style.position = "relative";
    wrapper.style.width = computed.width;
    wrapper.style.height = computed.height;
    wrapper.style.margin = computed.margin;
    wrapper.style.verticalAlign = computed.verticalAlign;

    // Insert wrapper in DOM
    img.parentNode.insertBefore(wrapper, img);
    wrapper.appendChild(img);

    // Reset image margin inside wrapper
    img.style.display = "block";
    img.style.margin = "0";
    img.style.width = "100%";
    img.style.height = "100%";

    // The overlay button
    const btn = document.createElement("button");
    btn.className = "__bid-btn";
    btn.innerHTML = '<span class="__bid-btn-label">+ Add</span><span class="__bid-btn-label--remove">✕ Remove</span>';
    btn.dataset.src = getBestImageUrl(img);

    wrapper.appendChild(btn);
  }

  // ── Event delegation (single handler for all buttons) ──

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".__bid-btn");
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const url = btn.dataset.src;

    if (btn.classList.contains("__bid-btn--added")) {
      // Toggle off — remove from collection
      await removeImage(url);
      btn.classList.remove("__bid-btn--added");
      btn.innerHTML = '<span class="__bid-btn-label">+ Add</span><span class="__bid-btn-label--remove">✕ Remove</span>';
    } else {
      // Add to collection
      await addImage(url);
      btn.classList.add("__bid-btn--added");
      btn.innerHTML = '<span class="__bid-btn-label">✓ Added</span><span class="__bid-btn-label--remove">✕ Remove</span>';
    }
  });

  // ── Initial scan ───────────────────────────────────────

  function scanAndInject() {
    const images = document.querySelectorAll("img");
    images.forEach((img) => {
      if (img.complete) {
        injectOverlay(img);
      } else {
        img.addEventListener("load", () => injectOverlay(img), { once: true });
      }
    });
  }

  // ── MutationObserver for lazy-loaded / SPA content ─────

  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(scanAndInject, DEBOUNCE_MS);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // ── Listen for messages from popup (e.g. reset states) ─

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "IMAGE_REMOVED") {
      // Reset the overlay button for a specific image
      const btn = document.querySelector(`.__bid-btn[data-src="${CSS.escape(msg.url)}"]`);
      if (btn) {
        btn.classList.remove("__bid-btn--added");
        btn.innerHTML = '<span class="__bid-btn-label">+ Add</span><span class="__bid-btn-label--remove">✕ Remove</span>';
      }
    }

    if (msg.type === "CLEAR_ALL") {
      document.querySelectorAll(".__bid-btn--added").forEach((btn) => {
        btn.classList.remove("__bid-btn--added");
        btn.innerHTML = '<span class="__bid-btn-label">+ Add</span><span class="__bid-btn-label--remove">✕ Remove</span>';
      });
    }
  });

  // ── Restore button states for already-selected images ──

  async function restoreStates() {
    const images = await getStoredImages();
    document.querySelectorAll(".__bid-btn").forEach((btn) => {
      if (images.includes(btn.dataset.src)) {
        btn.classList.add("__bid-btn--added");
        btn.innerHTML = '<span class="__bid-btn-label">✓ Added</span><span class="__bid-btn-label--remove">✕ Remove</span>';
      }
    });
    updateBadge(images.length);
  }

  // ── Boot ───────────────────────────────────────────────

  scanAndInject();
  restoreStates();
})();
