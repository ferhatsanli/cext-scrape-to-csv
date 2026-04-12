export const DEFAULT_SETTINGS = {
  language: "tr",
  showColumnNames: true
};

export const DEFAULT_DATA = {
  settings: DEFAULT_SETTINGS,
  templates: [
    {
      id: "tpl_linkedin_jobs",
      name: "LinkedIn Jobs",
      urlMatch: "www.linkedin.com",
      lists: [
        {
          id: "list_default",
          name: "Default",
          fields: []
        }
      ]
    }
  ],
  activeTemplateId: "tpl_linkedin_jobs",
  activeListId: "list_default",
  pendingDelete: null
};

export const STRINGS = {
  en: {
    appTitle: "Job Capture Assistant",
    selectElement: "Select Element",
    scrapeNow: "Scrape Now",
    columnNames: "Column Names",
    addList: "New List",
    renameList: "Rename",
    deleteList: "Delete",
    settings: "Settings",
    selectorPreview: "Selector",
    reorder: "Order",
    remove: "Delete",
    columnName: "Column Name",
    fieldRemoved: "Field removed",
    undo: "Undo",
    dismiss: "Dismiss",
    noFields: "No fields yet",
    activeList: "Active List",
    createList: "Create List",
    listName: "List name",
    save: "Save",
    cancel: "Cancel",
    ok: "OK",
    update: "Update",
    createDuplicate: "Create Duplicate",
    duplicateTitle: "A similar field already exists",
    duplicateMessage: "What do you want to do with this field?",
    chooseColumnName: "Column name:",
    settingsTitle: "Settings",
    language: "Language",
    templateMatches: "Template Matches",
    templateName: "Template Name",
    urlMatch: "URL Match",
    saved: "Saved",
    deleteListConfirm: "Delete this list?",
    cannotDeleteOnlyList: "At least one list must remain.",
    switchedTemplate: "Template switched",
    copied: "Copied to clipboard",
    failedToCopy: "Copy failed",
    pickModeStarted: "Pick mode started"
  },
  tr: {
    appTitle: "Job Capture Assistant",
    selectElement: "Element Seç",
    scrapeNow: "Şimdi Scrape Et",
    columnNames: "Column Names",
    addList: "Yeni Liste",
    renameList: "Yeniden Adlandır",
    deleteList: "Listeyi Sil",
    settings: "Ayarlar",
    selectorPreview: "Seçici",
    reorder: "Sıra",
    remove: "Sil",
    columnName: "Sütun Adı",
    fieldRemoved: "Alan kaldırıldı",
    undo: "Geri Al",
    dismiss: "Kapat",
    noFields: "Henüz alan yok",
    activeList: "Aktif Liste",
    createList: "Liste Oluştur",
    listName: "Liste adı",
    save: "Kaydet",
    cancel: "İptal",
    ok: "Tamam",
    update: "Güncelle",
    createDuplicate: "Kopya Oluştur",
    duplicateTitle: "Benzer bir alan zaten var",
    duplicateMessage: "Bu alan için ne yapmak istiyorsun?",
    chooseColumnName: "Sütun adı:",
    settingsTitle: "Ayarlar",
    language: "Dil",
    templateMatches: "Template Matches",
    templateName: "Template Adı",
    urlMatch: "URL Match",
    saved: "Kaydedildi",
    deleteListConfirm: "Bu liste silinsin mi?",
    cannotDeleteOnlyList: "En az bir liste kalmalı.",
    switchedTemplate: "Template değiştirildi",
    copied: "Panoya kopyalandı",
    failedToCopy: "Kopyalama başarısız",
    pickModeStarted: "Seçim modu başlatıldı"
  }
};

export function uuid(prefix = "id") {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export async function getState() {
  const stored = await chrome.storage.local.get(null);
  if (!stored || Object.keys(stored).length === 0) {
    await chrome.storage.local.set(deepClone(DEFAULT_DATA));
    return deepClone(DEFAULT_DATA);
  }

  const merged = {
    ...deepClone(DEFAULT_DATA),
    ...stored,
    settings: {
      ...deepClone(DEFAULT_SETTINGS),
      ...(stored.settings || {})
    }
  };

  if (!Array.isArray(merged.templates) || merged.templates.length === 0) {
    merged.templates = deepClone(DEFAULT_DATA.templates);
  }

  if (!merged.activeTemplateId) {
    merged.activeTemplateId = merged.templates[0].id;
  }

  const activeTemplate = merged.templates.find((t) => t.id === merged.activeTemplateId) || merged.templates[0];
  if (!Array.isArray(activeTemplate.lists) || activeTemplate.lists.length === 0) {
    activeTemplate.lists = deepClone(DEFAULT_DATA.templates[0].lists);
  }

  if (!merged.activeListId || !activeTemplate.lists.some((l) => l.id === merged.activeListId)) {
    merged.activeListId = activeTemplate.lists[0].id;
  }

  return merged;
}

export async function setState(nextState) {
  await chrome.storage.local.set(nextState);
  return nextState;
}

export function getLanguageStrings(language) {
  return STRINGS[language] || STRINGS.en;
}

export function getActiveTemplate(state) {
  return state.templates.find((t) => t.id === state.activeTemplateId) || state.templates[0];
}

export function getActiveList(state) {
  const template = getActiveTemplate(state);
  return template.lists.find((l) => l.id === state.activeListId) || template.lists[0];
}

export function getTemplateForUrl(state, url) {
  try {
    const current = new URL(url);
    const host = current.hostname.toLowerCase();
    return state.templates.find((tpl) => {
      const match = (tpl.urlMatch || "").trim().toLowerCase();
      return match && host === match;
    }) || null;
  } catch {
    return null;
  }
}

export function ensureFieldDefaults(field, index = 0) {
  return {
    id: field.id || uuid("fld"),
    columnName: field.columnName || `column${String(index + 1).padStart(2, "0")}`,
    order: typeof field.order === "number" ? field.order : index,
    selectorBundle: field.selectorBundle || {},
    previewLabel: field.previewLabel || "...unknown",
    createdAt: field.createdAt || Date.now(),
    updatedAt: field.updatedAt || Date.now()
  };
}

export function normalizeFields(fields) {
  return (fields || [])
    .map((f, index) => ensureFieldDefaults(f, index))
    .sort((a, b) => a.order - b.order)
    .map((f, index) => ({ ...f, order: index }));
}

export function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
}

export function toCsvLine(values) {
  return values.map(csvEscape).join(",");
}

export function nextGenericColumnName(fields) {
  const used = new Set((fields || []).map((f) => f.columnName));
  let index = 1;
  while (true) {
    const name = `column${String(index).padStart(2, "0")}`;
    if (!used.has(name)) return name;
    index += 1;
  }
}

export function selectorPreview(selectorBundle) {
  const source =
    selectorBundle?.idValue ||
    selectorBundle?.primarySelector ||
    selectorBundle?.fallbackSelectors?.[0] ||
    "unknown";

  if (source.length <= 10) return source;
  return `...${source.slice(-10)}`;
}

export function selectorTooltip(selectorBundle) {
  const lines = [];
  if (selectorBundle?.primaryType) lines.push(`Primary Type: ${selectorBundle.primaryType}`);
  if (selectorBundle?.primarySelector) lines.push(`Primary: ${selectorBundle.primarySelector}`);
  if (selectorBundle?.fallbackSelectors?.length) {
    selectorBundle.fallbackSelectors.forEach((item, index) => {
      lines.push(`Fallback ${index + 1}: ${item}`);
    });
  }
  if (selectorBundle?.textSample) lines.push(`Text Sample: ${selectorBundle.textSample}`);
  return lines.join("\n");
}

export function areSelectorBundlesSimilar(a, b) {
  if (!a || !b) return false;

  const aPrimary = a.primarySelector || "";
  const bPrimary = b.primarySelector || "";
  const aId = a.idValue || "";
  const bId = b.idValue || "";

  if (aId && bId && aId === bId) return true;
  if (aPrimary && bPrimary && aPrimary === bPrimary) return true;

  const aFallback = JSON.stringify(a.fallbackSelectors || []);
  const bFallback = JSON.stringify(b.fallbackSelectors || []);
  return aFallback === bFallback && aFallback !== "[]";
}