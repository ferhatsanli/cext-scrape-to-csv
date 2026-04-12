import {
  getState,
  getActiveTemplate,
  getActiveList,
  updateSettings,
  setActiveTemplate,
  setActiveList,
  createList,
  renameList,
  deleteList,
  createTemplate,
  renameTemplate,
  deleteTemplate,
  nextGenericColumnName,
  upsertField,
  deleteField,
  undoPendingDelete,
  clearPendingUndo,
  reorderFields
} from "./storage.js";
import { t } from "./i18n.js";
import { promptDialog, confirmThreeWayDialog } from "./dialogs.js";
import { isDuplicateField } from "./selectors.js";

const refs = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheRefs();
  bindEvents();
  chrome.runtime.onMessage.addListener(onRuntimeMessage);
  await render();
  startUndoWatcher();
}

function cacheRefs() {
  refs.appTitle = document.getElementById("appTitle");
  refs.openSettingsBtn = document.getElementById("openSettingsBtn");
  refs.templateSelect = document.getElementById("templateSelect");
  refs.newTemplateBtn = document.getElementById("newTemplateBtn");
  refs.renameTemplateBtn = document.getElementById("renameTemplateBtn");
  refs.deleteTemplateBtn = document.getElementById("deleteTemplateBtn");
  refs.listSelect = document.getElementById("listSelect");
  refs.newListBtn = document.getElementById("newListBtn");
  refs.renameListBtn = document.getElementById("renameListBtn");
  refs.deleteListBtn = document.getElementById("deleteListBtn");
  refs.showColumnNamesCheckbox = document.getElementById("showColumnNamesCheckbox");
  refs.selectElementBtn = document.getElementById("selectElementBtn");
  refs.scrapeNowBtn = document.getElementById("scrapeNowBtn");
  refs.fieldsTbody = document.getElementById("fieldsTbody");
  refs.tableHeadRow = document.getElementById("tableHeadRow");
  refs.emptyState = document.getElementById("emptyState");
  refs.undoBar = document.getElementById("undoBar");
  refs.undoText = document.getElementById("undoText");
  refs.undoBtn = document.getElementById("undoBtn");
  refs.dismissUndoBtn = document.getElementById("dismissUndoBtn");
  refs.activeTemplateLabel = document.getElementById("activeTemplateLabel");
  refs.activeListLabel = document.getElementById("activeListLabel");
  refs.columnNamesLabel = document.getElementById("columnNamesLabel");
}

function bindEvents() {
  refs.openSettingsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());

  refs.templateSelect.addEventListener("change", async (e) => {
    await setActiveTemplate(e.target.value);
    await render();
  });

  refs.listSelect.addEventListener("change", async (e) => {
    await setActiveList(e.target.value);
    await render();
  });

  refs.showColumnNamesCheckbox.addEventListener("change", async (e) => {
    await updateSettings({ showColumnNames: e.target.checked });
    await render();
  });

  refs.selectElementBtn.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "START_SELECTION_MODE" });
    window.close();
  });

  refs.scrapeNowBtn.addEventListener("click", async () => {
    const response = await chrome.runtime.sendMessage({ type: "SCRAPE_NOW" });
    if (!response?.ok) {
      alert(response?.error || "Scrape failed");
      return;
    }
  });

  refs.newListBtn.addEventListener("click", async () => {
    const state = await getState();
    const lang = state.settings.language;
    const result = await promptDialog({
      title: t(lang, "newList"),
      message: t(lang, "nameList"),
      defaultValue: ""
    });

    if (result.action === "ok") {
      await createList(result.value);
      await render();
    }
  });

  refs.renameListBtn.addEventListener("click", async () => {
    const state = await getState();
    const list = getActiveList(state);
    const lang = state.settings.language;

    const result = await promptDialog({
      title: t(lang, "renameList"),
      message: t(lang, "nameList"),
      defaultValue: list?.name || ""
    });

    if (result.action === "ok" && list) {
      await renameList(list.id, result.value);
      await render();
    }
  });

  refs.deleteListBtn.addEventListener("click", async () => {
    try {
      await deleteList(refs.listSelect.value);
      await render();
    } catch (error) {
      alert(error.message);
    }
  });

  refs.newTemplateBtn.addEventListener("click", async () => {
    const state = await getState();
    const lang = state.settings.language;

    const nameResult = await promptDialog({
      title: t(lang, "addTemplate"),
      message: t(lang, "nameTemplate"),
      defaultValue: ""
    });

    if (nameResult.action !== "ok") return;

    const urlResult = await promptDialog({
      title: t(lang, "urlMatch"),
      message: t(lang, "urlMatch"),
      defaultValue: ""
    });

    if (urlResult.action !== "ok") return;

    await createTemplate(nameResult.value, urlResult.value);
    await render();
  });

  refs.renameTemplateBtn.addEventListener("click", async () => {
    const state = await getState();
    const template = getActiveTemplate(state);
    const lang = state.settings.language;

    const result = await promptDialog({
      title: t(lang, "renameTemplate"),
      message: t(lang, "nameTemplate"),
      defaultValue: template?.name || ""
    });

    if (result.action === "ok" && template) {
      await renameTemplate(template.id, result.value);
      await render();
    }
  });

  refs.deleteTemplateBtn.addEventListener("click", async () => {
    try {
      await deleteTemplate(refs.templateSelect.value);
      await render();
    } catch (error) {
      alert(error.message);
    }
  });

  refs.undoBtn.addEventListener("click", async () => {
    await undoPendingDelete();
    await render();
  });

  refs.dismissUndoBtn.addEventListener("click", async () => {
    await clearPendingUndo();
    await render();
  });
}

async function onRuntimeMessage(message) {
  if (message?.type === "ELEMENT_SELECTED") {
    await handleElementSelected(message.payload);
  }
}

async function handleElementSelected(payload) {
  const state = await getState();
  const template = getActiveTemplate(state);
  const list = getActiveList(state);

  if (!template || !list) return;

  const lang = state.settings.language;
  const duplicate = list.fields.find((f) => isDuplicateField(f, payload.selectorBundle));

  let columnName;
  if (state.settings.showColumnNames) {
    const result = await promptDialog({
      title: t(lang, "columnName"),
      message: t(lang, "columnNamePrompt"),
      defaultValue: ""
    });

    if (result.action === "ok" && result.value) {
      columnName = result.value;
    } else {
      columnName = nextGenericColumnName(list.fields);
    }
  } else {
    columnName = nextGenericColumnName(list.fields);
  }

  const baseField = {
    columnName,
    order: list.fields.length + 1,
    selectorBundle: payload.selectorBundle,
    previewLabel: payload.previewLabel
  };

  if (duplicate) {
    const action = await confirmThreeWayDialog({
      title: t(lang, "duplicateTitle"),
      message: t(lang, "duplicateMessage")
    });

    if (action === "cancel") return;

    if (action === "update") {
      await upsertField({
        templateId: template.id,
        listId: list.id,
        mode: "update",
        field: {
          ...duplicate,
          ...baseField,
          id: duplicate.id
        }
      });
    }

    if (action === "duplicate") {
      await upsertField({
        templateId: template.id,
        listId: list.id,
        mode: "create",
        field: baseField
      });
    }
  } else {
    await upsertField({
      templateId: template.id,
      listId: list.id,
      mode: "create",
      field: baseField
    });
  }

  await render();
}

async function render() {
  const state = await getState();
  const lang = state.settings.language;
  const template = getActiveTemplate(state);
  const list = getActiveList(state);

  refs.appTitle.textContent = t(lang, "appTitle");
  refs.openSettingsBtn.textContent = t(lang, "settings");
  refs.activeTemplateLabel.textContent = t(lang, "activeTemplate");
  refs.activeListLabel.textContent = t(lang, "activeList");
  refs.columnNamesLabel.textContent = t(lang, "columnNames");
  refs.selectElementBtn.textContent = t(lang, "selectElement");
  refs.scrapeNowBtn.textContent = t(lang, "scrapeNow");
  refs.emptyState.textContent = t(lang, "noFields");
  refs.undoText.textContent = t(lang, "fieldRemoved");
  refs.undoBtn.textContent = t(lang, "undo");
  refs.dismissUndoBtn.textContent = t(lang, "dismiss");

  refs.showColumnNamesCheckbox.checked = state.settings.showColumnNames;

  renderTemplateSelect(state.templates, state.activeTemplateId);
  renderListSelect(template?.lists || [], state.activeListId);
  renderTableHeader(state.settings.showColumnNames, lang);
  renderFields(list?.fields || [], state.settings.showColumnNames, lang);

  refs.undoBar.classList.toggle("hidden", !state.pendingUndo);
}

function renderTemplateSelect(templates, activeTemplateId) {
  refs.templateSelect.innerHTML = templates
    .map((template) => `<option value="${template.id}" ${template.id === activeTemplateId ? "selected" : ""}>${escapeHtml(template.name)}</option>`)
    .join("");
}

function renderListSelect(lists, activeListId) {
  refs.listSelect.innerHTML = lists
    .map((list) => `<option value="${list.id}" ${list.id === activeListId ? "selected" : ""}>${escapeHtml(list.name)}</option>`)
    .join("");
}

function renderTableHeader(showColumnNames, lang) {
  const cols = [];
  if (showColumnNames) {
    cols.push(`<th>${escapeHtml(t(lang, "columnName"))}</th>`);
  }
  cols.push(`<th>${escapeHtml(t(lang, "selectorPreview"))}</th>`);
  cols.push(`<th>${escapeHtml(t(lang, "reorder"))}</th>`);
  cols.push(`<th>${escapeHtml(t(lang, "delete"))}</th>`);
  refs.tableHeadRow.innerHTML = cols.join("");
}

function renderFields(fields, showColumnNames, lang) {
  const sorted = [...fields].sort((a, b) => a.order - b.order);
  refs.fieldsTbody.innerHTML = "";

  if (!sorted.length) {
    refs.emptyState.style.display = "block";
    return;
  }

  refs.emptyState.style.display = "none";

  for (const field of sorted) {
    const tr = document.createElement("tr");
    tr.draggable = true;
    tr.dataset.fieldId = field.id;

    const tooltip = buildTooltip(field.selectorBundle);

    if (showColumnNames) {
      tr.appendChild(td(field.columnName || ""));
    }

    const selectorCell = td(field.previewLabel || "");
    selectorCell.classList.add("tooltip-cell");
    selectorCell.title = tooltip;
    tr.appendChild(selectorCell);

    const handleCell = td("≡");
    handleCell.classList.add("drag-handle");
    tr.appendChild(handleCell);

    const deleteCell = document.createElement("td");
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-field-btn";
    deleteBtn.textContent = "×";
    deleteBtn.addEventListener("click", async () => {
      const state = await getState();
      const template = getActiveTemplate(state);
      const list = getActiveList(state);
      await deleteField(template.id, list.id, field.id);
      await render();
    });
    deleteCell.appendChild(deleteBtn);
    tr.appendChild(deleteCell);

    addDragAndDrop(tr);
    refs.fieldsTbody.appendChild(tr);
  }
}

function addDragAndDrop(row) {
  row.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", row.dataset.fieldId);
  });

  row.addEventListener("dragover", (e) => {
    e.preventDefault();
  });

  row.addEventListener("drop", async (e) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain");
    const targetId = row.dataset.fieldId;
    if (!draggedId || !targetId || draggedId === targetId) return;

    const ids = [...refs.fieldsTbody.querySelectorAll("tr")].map((tr) => tr.dataset.fieldId);
    const draggedIndex = ids.indexOf(draggedId);
    const targetIndex = ids.indexOf(targetId);

    ids.splice(draggedIndex, 1);
    ids.splice(targetIndex, 0, draggedId);

    const state = await getState();
    const template = getActiveTemplate(state);
    const list = getActiveList(state);

    await reorderFields(template.id, list.id, ids);
    await render();
  });
}

function td(text) {
  const cell = document.createElement("td");
  cell.textContent = text;
  return cell;
}

function buildTooltip(bundle = {}) {
  const lines = [
    `Primary: ${bundle.primarySelector || ""}`
  ];

  for (const fallback of bundle.fallbackSelectors || []) {
    lines.push(`Fallback: ${fallback}`);
  }

  if (bundle.textSample) {
    lines.push(`Text sample: ${bundle.textSample}`);
  }

  return lines.join("\n");
}

function startUndoWatcher() {
  setInterval(async () => {
    const state = await getState();
    if (!state.pendingUndo) return;

    if (Date.now() > state.pendingUndo.expiresAt) {
      await clearPendingUndo();
      await render();
    }
  }, 1000);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}