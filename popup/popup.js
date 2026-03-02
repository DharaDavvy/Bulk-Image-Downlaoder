/* ==========================================================
   Bulk Image Downloader — Popup Script
   Reads selected images from storage, renders them,
   handles Remove / Clear All / Download All actions
   ========================================================== */

(() => {
  "use strict";

  const listEl = document.getElementById("list");
  const emptyEl = document.getElementById("empty");
  const footerEl = document.getElementById("footer");
  const countEl = document.getElementById("count");
  const dlCountEl = document.getElementById("dlCount");
  const downloadBtn = document.getElementById("downloadBtn");
  const clearBtn = document.getElementById("clearBtn");
  const progressEl = document.getElementById("progress");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");

  // ── Helpers ────────────────────────────────────────────

  function getFilename(url) {
    try {
      const pathname = new URL(url).pathname;
      const segments = pathname.split("/");
      return decodeURIComponent(segments[segments.length - 1] || "image");
    } catch {
      return "image";
    }
  }

  function truncateUrl(url, max = 50) {
    return url.length > max ? url.slice(0, max) + "…" : url;
  }

  // ── Render ─────────────────────────────────────────────

  async function render() {
    const { selectedImages = [] } = await chrome.storage.local.get({ selectedImages: [] });

    // Update counts
    const n = selectedImages.length;
    countEl.textContent = `${n} image${n !== 1 ? "s" : ""} selected`;
    dlCountEl.textContent = n;

    // Toggle empty state
    if (n === 0) {
      listEl.innerHTML = "";
      emptyEl.classList.add("empty--visible");
      footerEl.classList.add("footer--hidden");
      return;
    }

    emptyEl.classList.remove("empty--visible");
    footerEl.classList.remove("footer--hidden");

    // Build list
    listEl.innerHTML = "";
    selectedImages.forEach((url) => {
      const item = document.createElement("div");
      item.className = "list-item";

      const thumb = document.createElement("img");
      thumb.className = "list-item__thumb";
      thumb.src = url;
      thumb.alt = "";
      thumb.loading = "lazy";
      thumb.addEventListener("error", () => {
        // Replace broken image with a placeholder
        const placeholder = document.createElement("div");
        placeholder.className = "list-item__thumb list-item__thumb--broken";
        placeholder.textContent = "🖼";
        thumb.replaceWith(placeholder);
      });

      const info = document.createElement("div");
      info.className = "list-item__info";

      const name = document.createElement("p");
      name.className = "list-item__name";
      name.textContent = getFilename(url);

      const urlText = document.createElement("p");
      urlText.className = "list-item__url";
      urlText.textContent = truncateUrl(url);
      urlText.title = url;

      info.appendChild(name);
      info.appendChild(urlText);

      const removeBtn = document.createElement("button");
      removeBtn.className = "list-item__remove";
      removeBtn.title = "Remove";
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", () => handleRemove(url));

      item.appendChild(thumb);
      item.appendChild(info);
      item.appendChild(removeBtn);
      listEl.appendChild(item);
    });
  }

  // ── Actions ────────────────────────────────────────────

  async function handleRemove(url) {
    let { selectedImages = [] } = await chrome.storage.local.get({ selectedImages: [] });
    selectedImages = selectedImages.filter((u) => u !== url);
    await chrome.storage.local.set({ selectedImages });

    // Notify content script to reset overlay button
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: "IMAGE_REMOVED", url }).catch(() => {});
    }

    chrome.runtime.sendMessage({ type: "UPDATE_BADGE", count: selectedImages.length });
    render();
  }

  async function handleClearAll() {
    await chrome.storage.local.set({ selectedImages: [] });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: "CLEAR_ALL" }).catch(() => {});
    }

    chrome.runtime.sendMessage({ type: "UPDATE_BADGE", count: 0 });
    render();
  }

  async function handleDownloadAll() {
    const { selectedImages = [] } = await chrome.storage.local.get({ selectedImages: [] });
    if (selectedImages.length === 0) return;

    downloadBtn.disabled = true;
    downloadBtn.textContent = "Downloading…";
    clearBtn.disabled = true;

    // Show progress bar
    progressEl.classList.add("progress--visible");
    progressBar.style.width = "0%";
    progressText.textContent = `0 / ${selectedImages.length}`;

    let failCount = 0;

    chrome.runtime.sendMessage(
      { type: "DOWNLOAD_ALL", urls: selectedImages },
      (response) => {
        downloadBtn.disabled = false;
        clearBtn.disabled = false;

        if (response?.success) {
          const results = response.results || [];
          failCount = results.filter((r) => !r.success).length;

          if (failCount > 0) {
            downloadBtn.textContent = `⚠ ${failCount} failed`;
            progressBar.classList.add("progress__bar--error");

            setTimeout(() => {
              downloadBtn.innerHTML = `Download All (<span id="dlCount">${selectedImages.length}</span>)`;
              progressEl.classList.remove("progress--visible");
              progressBar.classList.remove("progress__bar--error");
            }, 3000);
          } else {
            downloadBtn.textContent = "✓ Done!";

            // Clear collection after successful download
            clearAfterDownload();

            setTimeout(() => {
              progressEl.classList.remove("progress--visible");
            }, 2000);
          }
        } else {
          downloadBtn.textContent = "✕ Error";
          setTimeout(() => {
            downloadBtn.innerHTML = `Download All (<span id="dlCount">0</span>)`;
            progressEl.classList.remove("progress--visible");
          }, 3000);
        }
      }
    );
  }

  /** Clear the collection after a successful download */
  async function clearAfterDownload() {
    await chrome.storage.local.set({ selectedImages: [] });

    // Reset all overlay buttons on the page
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: "CLEAR_ALL" }).catch(() => {});
    }

    // Reset badge
    chrome.runtime.sendMessage({ type: "UPDATE_BADGE", count: 0 });

    // Re-render popup to show empty state
    render();
  }

  // ── Event Listeners ────────────────────────────────────

  downloadBtn.addEventListener("click", handleDownloadAll);
  clearBtn.addEventListener("click", handleClearAll);

  // Re-render when storage changes (e.g. user adds image while popup is open)
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.selectedImages) render();
  });

  // Listen for download progress from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "DOWNLOAD_PROGRESS") {
      const pct = Math.round((msg.current / msg.total) * 100);
      progressBar.style.width = `${pct}%`;

      if (msg.status === "complete") {
        progressText.textContent = `${msg.total} / ${msg.total} — Complete!`;
      } else if (msg.status === "failed") {
        progressText.textContent = `${msg.current} / ${msg.total} — Failed`;
      } else {
        progressText.textContent = `${msg.current} / ${msg.total}`;
      }
    }
  });

  // ── Init ───────────────────────────────────────────────
  render();
})();
