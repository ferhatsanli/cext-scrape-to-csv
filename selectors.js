export function cssEscapeSafe(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

export function buildSelectorBundle(element) {
  const tagName = element.tagName.toLowerCase();
  const textSample = (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);

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

  const uniqueSelectors = dedupeSelectors(selectors);

  return {
    primaryType: uniqueSelectors[0]?.type || "unknown",
    primarySelector: uniqueSelectors[0]?.selector || tagName,
    fallbackSelectors: uniqueSelectors.slice(1).map((s) => s.selector),
    tagName,
    textSample
  };
}

function dedupeSelectors(selectors) {
  const seen = new Set();
  return selectors.filter((item) => {
    if (!item.selector || seen.has(item.selector)) return false;
    seen.add(item.selector);
    return true;
  });
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

export function selectorPreview(bundle) {
  const raw = bundle.primarySelector || bundle.tagName || "unknown";
  return raw.length <= 10 ? raw : `...${raw.slice(-10)}`;
}

export function isDuplicateField(existingField, incomingBundle) {
  if (!existingField?.selectorBundle || !incomingBundle) return false;

  const a = existingField.selectorBundle;
  const samePrimary = a.primarySelector === incomingBundle.primarySelector;

  const aFallbacks = new Set(a.fallbackSelectors || []);
  const bFallbacks = new Set(incomingBundle.fallbackSelectors || []);

  const hasFallbackOverlap = [...aFallbacks].some((s) => bFallbacks.has(s));

  return samePrimary || hasFallbackOverlap;
}