(() => {
  if (window.__jobCaptureContentScriptLoaded) return;
  window.__jobCaptureContentScriptLoaded = true;

  let pickModeActive = false;
  let overlay = null;
  let currentTarget = null;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "START_PICK_MODE") {
      startPickMode();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "SCRAPE_FIELDS") {
      const values = (message.fields || []).map((field) => scrapeField(field.selectorBundle));
      sendResponse({ ok: true, values });
      return;
    }
  });

  function startPickMode() {
    if (pickModeActive) return;
    pickModeActive = true;

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "__job_capture_overlay";
      overlay.style.position = "fixed";
      overlay.style.pointerEvents = "none";
      overlay.style.zIndex = "2147483647";
      overlay.style.border = "2px solid #2563eb";
      overlay.style.background = "rgba(37, 99, 235, 0.08)";
      overlay.style.borderRadius = "6px";
      overlay.style.display = "none";
      document.documentElement.appendChild(overlay);
    }

    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClickPick, true);
    document.addEventListener("keydown", onKeyDown, true);
  }

  function stopPickMode() {
    pickModeActive = false;
    currentTarget = null;

    if (overlay) {
      overlay.style.display = "none";
    }

    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClickPick, true);
    document.removeEventListener("keydown", onKeyDown, true);
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      stopPickMode();
    }
  }

  function onMouseMove(event) {
    const target = getValidTarget(event.target);
    if (!target) return;

    currentTarget = target;
    const rect = target.getBoundingClientRect();

    overlay.style.display = "block";
    overlay.style.left = `${rect.left + window.scrollX}px`;
    overlay.style.top = `${rect.top + window.scrollY}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
  }

  async function onClickPick(event) {
    if (!pickModeActive) return;

    event.preventDefault();
    event.stopPropagation();

    const target = getValidTarget(event.target);
    if (!target) return;

    const selectorBundle = buildSelectorBundle(target);
    const fieldText = normalizeText(target.textContent || "");
    const pageUrl = location.href;

    stopPickMode();

    const response = await chrome.runtime.sendMessage({
      type: "CONTENT_FIELD_PICKED",
      selectorBundle,
      fieldText,
      pageUrl
    }).catch(() => null);

    if (!response?.ok) {
      const fallback = await chrome.storage.local.get(null);
      const state = fallback || {};
      await createFieldFlow(selectorBundle, state, pageUrl);
      return;
    }
  }

  async function createFieldFlow(selectorBundle, state, pageUrl) {
    const all = await chrome.storage.local.get(null);
    const settings = all.settings || { showColumnNames: true };
    const templates = all.templates || [];
    const activeTemplateId = all.activeTemplateId;
    const activeListId = all.activeListId;

    const currentTemplate = templates.find((t) => t.id === activeTemplateId);
    if (!currentTemplate) return;

    const currentList = currentTemplate.lists.find((l) => l.id === activeListId);
    if (!currentList) return;

    let columnName = "";
    if (settings.showColumnNames) {
      columnName = await askColumnName();
    }

    await chrome.runtime.sendMessage({
      type: "ADD_PICKED_FIELD_TO_STATE",
      selectorBundle,
      requestedColumnName: columnName
    }).catch(() => null);
  }

  function getValidTarget(target) {
    if (!(target instanceof Element)) return null;
    if (target.id === "__job_capture_overlay") return null;
    return target;
  }

  function scrapeField(selectorBundle) {
    const target =
      findBySelectorBundle(selectorBundle) ||
      null;

    return target ? normalizeText(target.textContent || "") : "";
  }

  function findBySelectorBundle(bundle) {
    if (!bundle) return null;

    const candidates = [];

    if (bundle.idValue) {
      const byId = document.getElementById(bundle.idValue);
      if (byId) candidates.push(byId);
    }

    if (bundle.primarySelector) {
      try {
        const node = document.querySelector(bundle.primarySelector);
        if (node) candidates.push(node);
      } catch {}
    }

    for (const selector of bundle.fallbackSelectors || []) {
      try {
        const node = document.querySelector(selector);
        if (node) candidates.push(node);
      } catch {}
    }

    if (!candidates.length) return null;

    const textSample = normalizeText(bundle.textSample || "");
    if (!textSample) return candidates[0];

    const exact = candidates.find((node) => normalizeText(node.textContent || "") === textSample);
    return exact || candidates[0];
  }

  function buildSelectorBundle(element) {
    const tagName = element.tagName.toLowerCase();
    const textSample = normalizeText(element.textContent || "").slice(0, 200);
    const idValue = element.id || "";

    const attrSelectors = [];
    for (const attr of ["data-test-id", "data-testid", "data-qa", "aria-label", "name", "role"]) {
      const value = element.getAttribute(attr);
      if (value) {
        attrSelectors.push(`${tagName}[${cssEscape(attr)}="${cssEscape(value)}"]`);
      }
    }

    const cssPath = buildCssPath(element);
    const nthPath = buildNthPath(element);

    const primarySelector =
      idValue ? `#${cssEscape(idValue)}` :
      attrSelectors[0] || cssPath || nthPath || tagName;

    const fallbackSelectors = [];
    for (const item of [attrSelectors[0], cssPath, nthPath]) {
      if (item && item !== primarySelector && !fallbackSelectors.includes(item)) {
        fallbackSelectors.push(item);
      }
    }

    return {
      primaryType: idValue ? "id" : attrSelectors[0] ? "attribute" : "css",
      primarySelector,
      fallbackSelectors,
      tagName,
      textSample,
      idValue
    };
  }

  function buildCssPath(element) {
    const parts = [];
    let current = element;
    let depth = 0;

    while (current && current.nodeType === Node.ELEMENT_NODE && depth < 5) {
      let part = current.tagName.toLowerCase();

      if (current.id) {
        part += `#${cssEscape(current.id)}`;
        parts.unshift(part);
        break;
      }

      const stableClass = [...current.classList].find((cls) => /^[a-zA-Z0-9_-]+$/.test(cls));
      if (stableClass) {
        part += `.${cssEscape(stableClass)}`;
      }

      parts.unshift(part);
      current = current.parentElement;
      depth += 1;
    }

    return parts.join(" > ");
  }

  function buildNthPath(element) {
    const parts = [];
    let current = element;
    let depth = 0;

    while (current && current.nodeType === Node.ELEMENT_NODE && depth < 6) {
      const tag = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (!parent) {
        parts.unshift(tag);
        break;
      }

      const sameTagSiblings = [...parent.children].filter((node) => node.tagName === current.tagName);
      const index = sameTagSiblings.indexOf(current) + 1;
      parts.unshift(`${tag}:nth-of-type(${index})`);
      current = parent;
      depth += 1;
    }

    return parts.join(" > ");
  }

  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }
    return String(value).replace(/["\\.#:[\]()=<>+~*^$|]/g, "\\$&");
  }

  async function askColumnName() {
    const result = prompt("Column name:");
    return result == null ? "" : result.trim();
  }
})();