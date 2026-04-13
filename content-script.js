(() => {
  if (window.__jobCopyExtensionLoaded) return;
  window.__jobCopyExtensionLoaded = true;

  let selectionMode = false;
  let hoverEl = null;
  let overlay = null;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "PING") {
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "ENTER_SELECTION_MODE") {
      enterSelectionMode();
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "SCRAPE_FIELDS") {
      try {
        const result = scrapeFields(message.payload);
        sendResponse({ ok: true, ...result });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
      return;
    }
    if (message?.type === "ASK_COLUMN_NAME") {
      const value = window.prompt("Column name:", message.payload?.defaultValue || "");
      if (value === null) {
        sendResponse({ action: "cancel", value: null });
      } else {
        sendResponse({ action: "ok", value });
      }
      return;
    }

    if (message?.type === "ASK_DUPLICATE_ACTION") {
      const value = window.prompt(
        "A similar field already exists.\nType one of: update, duplicate, cancel",
        "cancel"
      );

      const normalized = String(value || "cancel").trim().toLowerCase();

      if (normalized === "update") {
        sendResponse({ action: "update" });
      } else if (normalized === "duplicate") {
        sendResponse({ action: "duplicate" });
      } else {
        sendResponse({ action: "cancel" });
      }
      return;
    }
  });

  function enterSelectionMode() {
    if (selectionMode) return;
    selectionMode = true;

    ensureOverlay();

    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("pointerdown", swallowEvent, true);
    document.addEventListener("mousedown", swallowEvent, true);
    document.addEventListener("mouseup", swallowEvent, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
  }

  function exitSelectionMode() {
    selectionMode = false;
    hoverEl = null;

    if (overlay) {
      overlay.style.display = "none";
    }

    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("pointerdown", swallowEvent, true);
    document.removeEventListener("mousedown", swallowEvent, true);
    document.removeEventListener("mouseup", swallowEvent, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
  }

  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.border = "2px solid #ff4d4f";
    overlay.style.background = "rgba(255, 77, 79, 0.12)";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "2147483647";
    overlay.style.display = "none";
    document.documentElement.appendChild(overlay);
  }

  function onMouseMove(event) {
    const el = event.target;
    if (!(el instanceof Element)) return;

    hoverEl = el;
    const rect = el.getBoundingClientRect();
    overlay.style.display = "block";
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
  }

  async function onClick(event) {
    if (!selectionMode) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (!hoverEl) return;

    const selectorBundle = buildSelectorBundle(hoverEl);
    const previewLabel = selectorPreview(selectorBundle);

    try {
      const response = await chrome.runtime.sendMessage({
        type: "ELEMENT_SELECTED",
        payload: {
          selectorBundle,
          previewLabel,
          pageUrl: location.href
        }
      });

      if (!response?.ok) {
        console.error("ELEMENT_SELECTED failed:", response?.error);
      }
    } catch (error) {
      console.error("ELEMENT_SELECTED message failed:", error);
    } finally {
      exitSelectionMode();
    }
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      exitSelectionMode();
    }
  }

  function swallowEvent(event) {
    if (!selectionMode) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function scrapeFields({ template, list, settings }) {
    const values = [];
    const headers = [];

    const sortedFields = [...(list.fields || [])].sort((a, b) => a.order - b.order);

    for (const field of sortedFields) {
      const text = readFieldText(field.selectorBundle);
      values.push(text);
      headers.push(field.columnName || "");
    }

    const clipboardText = settings.showColumnNames
      ? `${toCsvRow(headers)}\n${toCsvRow(values)}`
      : toCsvRow(values);

    return {
      headers,
      values,
      clipboardText
    };
  }

  function readFieldText(bundle) {
    const selectors = [
      bundle.primarySelector,
      ...(bundle.fallbackSelectors || [])
    ].filter(Boolean);

    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el) {
          console.log("Matched selector:", selector, "Text:", normalizeText(el.textContent || ""));
          return normalizeText(el.textContent || "");
        }
      } catch (error) {
        console.warn("Bad selector:", selector, error);
      }
    }

    console.warn("No selector matched:", bundle);
    return "";
  }

  function normalizeText(value) {
    return String(value).replace(/\s+/g, " ").trim();
  }

  function toCsvRow(values) {
    return values
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(",");
  }

  function cssEscapeSafe(value) {
    if (window.CSS?.escape) return window.CSS.escape(value);
    return String(value).replace(/([^a-zA-Z0-9_-])/g, "\\$1");
  }

  function buildSelectorBundle(element) {
    const tagName = element.tagName.toLowerCase();
    const textSample = normalizeText(element.textContent || "").slice(0, 80);

    const selectors = [];

    if (element.id) {
      selectors.push({
        type: "id",
        selector: `#${cssEscapeSafe(element.id)}`
      });
    }

    const stableAttrs = [
      "data-testid",
      "data-test-id",
      "data-qa",
      "data-view-name",
      "data-tracking-control-name",
      "aria-label",
      "name",
      "role"
    ];

    for (const attr of stableAttrs) {
      const val = element.getAttribute(attr);
      if (val) {
        selectors.push({
          type: "attribute",
          selector: `${tagName}[${attr}="${val.replace(/"/g, '\\"')}"]`
        });
      }
    }

    const classSelector = buildClassBasedSelector(element);
    if (classSelector) {
      selectors.push({
        type: "class",
        selector: classSelector
      });
    }

    const structuralSelector = buildStructuralSelector(element);
    if (structuralSelector) {
      selectors.push({
        type: "structural",
        selector: structuralSelector
      });
    }

    const unique = dedupeSelectors(selectors);

    return {
      primaryType: unique[0]?.type || "unknown",
      primarySelector: unique[0]?.selector || tagName,
      fallbackSelectors: unique.slice(1).map((s) => s.selector),
      tagName,
      textSample
    };
  }

  function buildClassBasedSelector(element) {
    const tagName = element.tagName.toLowerCase();
    const classes = [...element.classList]
      .filter(Boolean)
      .filter((cls) => !/\d/.test(cls))
      .filter((cls) => !cls.includes("--"))
      .slice(0, 2);

    if (!classes.length) return null;

    return `${tagName}.${classes.map(cssEscapeSafe).join(".")}`;
  }

  function buildStructuralSelector(element) {
    const parts = [];
    let current = element;
    let depth = 0;

    while (current && current.nodeType === Node.ELEMENT_NODE && depth < 5) {
      const tag = current.tagName.toLowerCase();
      let part = tag;

      if (current.id) {
        part = `#${cssEscapeSafe(current.id)}`;
        parts.unshift(part);
        break;
      }

      const parent = current.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter((child) => child.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          part += `:nth-of-type(${index})`;
        }
      }

      parts.unshift(part);
      current = parent;
      depth += 1;
    }

    return parts.join(" > ");
  }

  function dedupeSelectors(selectors) {
    const seen = new Set();
    return selectors.filter((item) => {
      if (!item.selector || seen.has(item.selector)) return false;
      seen.add(item.selector);
      return true;
    });
  }

  function selectorPreview(bundle) {
    const raw = bundle.primarySelector || bundle.tagName || "unknown";
    return raw.length <= 10 ? raw : `...${raw.slice(-10)}`;
  }
})();