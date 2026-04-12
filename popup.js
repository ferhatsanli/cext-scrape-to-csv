import {
  getState,
  setState,
  getLanguageStrings,
  getActiveTemplate,
  getActiveList,
  normalizeFields,
  selectorTooltip,
  nextGenericColumnName,
  areSelectorBundlesSimilar,
  selectorPreview,
  uuid
} from "./shared.js";

let state = await getState();
let strings = getLanguageStrings(state.settings.language);

const elements = {
  appTitle: document.getElementById("appTitle"),
  activeListLabel: document.getElementById("activeListLabel"),
  listSelect: document.getElementById("listSelect"),
  openSettingsButton: document.getElementById("openSettingsButton"),
  showColumnNamesCheckbox: document.getElementById("showColumnNamesCheckbox"),
  columnNamesLabel: document.getElementById("columnNamesLabel"),
  selectElementButton: document.getElementById("selectElementButton"),
  scrapeNowButton: document.getElementById("scrapeNowButton"),
  newListButton: document.getElementById("newListButton"),
  renameListButton: document.getElementById("renameListButton"),
  deleteListButton: document.getElementById("deleteListButton"),
  tableHeadRow: document.getElementById("tableHeadRow"),
  fieldsTableBody: document.getElementById("fieldsTableBody"),
  emptyState: document.getElementById("emptyState"),
  toast: document.getElementById("toast"),
  toastText: document.getElementById("toastText"),
  toastUndoButton: document.getElementById("toastUndoButton"),
  toastDismissButton: document.getElementById("toastDismissButton"),
  nameDialog: document.getElementById("nameDialog"),
  nameDialogTitle: document.getElementById("nameDialogTitle"),
  nameDialogLabel: document.getElementById("nameDialogLabel"),
  nameDialogInput: document.getElementById("nameDialogInput"),
  nameDialogCancel: document.getElementById("nameDialogCancel"),
  nameDialogOk: document.getElementById("nameDialogOk"),
  duplicateDialog: document.getElementById("duplicateDialog"),
  duplicateDialogTitle: document.getElementById("duplicateDialogTitle"),
  duplicateDialogMessage: document.getElementById("duplicateDialogMessage"),
  duplicateDialogCancel: document.getElementById("duplicateDialogCancel"),
  duplicateDialogDuplicate: document.getElementById("duplicateDialogDuplicate"),
  duplicateDialogUpdate: document.getElementById("duplicateDialogUpdate")
};

bindEvents();
render();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === "CONTENT_FIELD_PICKED") {
      await handlePickedField(message.selectorBundle);
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "ADD_PICKED_FIELD_TO_STATE") {
      await handlePickedField(message.selectorBundle, message.requestedColumnName || "");
      sendResponse({ ok: true });
      return;
    }
  })();

  return true;
});

async function refreshState() {
  state = await getState();
  strings = getLanguageStrings(state.settings.language);
}

function bindEvents() {
  elements.showColumnNamesCheckbox.addEventListener("change", async (event) => {
    state.settings.showColumnNames = event.target.checked;
    await setState(state);
    render();
  });

  elements.listSelect.addEventListener("change", async (event) => {
    state.activeListId = event.target.value;
    await setState(state);
    render();
  });

  elements.selectElementButton.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "POPUP_START_PICK_MODE" });
    window.close();
  });

  elements.scrapeNowButton.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "POPUP_SCRAPE_NOW" });
    window.close();
  });

  elements.newListButton.addEventListener("click", async () => {
    const value = await openNameDialog(strings.createList, strings.listName, "");
    const name = (value || "").trim() || `List ${Date.now()}`;

    const template = getActiveTemplate(state);
    const newList = {
      id: uuid("list"),
      name,
      fields: []
    };

    template.lists.push(newList);
    state.activeListId = newList.id;
    await setState(state);
    render();
  });

  elements.renameListButton.addEventListener("click", async () => {
    const list = getActiveList(state);
    const value = await openNameDialog(strings.renameList, strings.listName, list.name);
    if (!value) return;

    list.name = value.trim();
    await setState(state);
    render();
  });

  elements.deleteListButton.addEventListener("click", async () => {
    const template = getActiveTemplate(state);
    if (template.lists.length === 1) {
      alert(strings.cannotDeleteOnlyList);
      return;
    }

    const confirmed = confirm(strings.deleteListConfirm);
    if (!confirmed) return;

    template.lists = template.lists.filter((l) => l.id !== state.activeListId);
    state.activeListId = template.lists[0].id;
    await setState(state);
    render();
  });

  elements.openSettingsButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  elements.toastUndoButton.addEventListener("click", async () => {
    if (!state.pendingDelete) return;

    const template = getActiveTemplate(state);
    const list = getActiveList(state);
    list.fields.splice(state.pendingDelete.index, 0, state.pendingDelete.field);
    list.fields = normalizeFields(list.fields);
    state.pendingDelete = null;

    await setState(state);
    hideToast();
    render();
  });

  elements.toastDismissButton.addEventListener("click", async () => {
    state.pendingDelete = null;
    await setState(state);
    hideToast();
  });
}

function render() {
  strings = getLanguageStrings(state.settings.language);

  elements.appTitle.textContent = strings.appTitle;
  elements.activeListLabel.textContent = strings.activeList;
  elements.columnNamesLabel.textContent = strings.columnNames;
  elements.selectElementButton.textContent = strings.selectElement;
  elements.scrapeNowButton.textContent = strings.scrapeNow;
  elements.newListButton.textContent = strings.addList;
  elements.renameListButton.textContent = strings.renameList;
  elements.deleteListButton.textContent = strings.deleteList;
  elements.emptyState.textContent = strings.noFields;
  elements.toastUndoButton.textContent = strings.undo;
  elements.toastDismissButton.textContent = strings.dismiss;

  elements.nameDialogCancel.textContent = strings.cancel;
  elements.nameDialogOk.textContent = strings.ok;
  elements.duplicateDialogTitle.textContent = strings.duplicateTitle;
  elements.duplicateDialogMessage.textContent = strings.duplicateMessage;
  elements.duplicateDialogCancel.textContent = strings.cancel;
  elements.duplicateDialogDuplicate.textContent = strings.createDuplicate;
  elements.duplicateDialogUpdate.textContent = strings.update;

  elements.showColumnNamesCheckbox.checked = !!state.settings.showColumnNames;

  renderListSelect();
  renderTable();
}

function renderListSelect() {
  const template = getActiveTemplate(state);
  const list = getActiveList(state);

  elements.listSelect.innerHTML = "";
  for (const item of template.lists) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    option.selected = item.id === list.id;
    elements.listSelect.appendChild(option);
  }
}

function renderTable() {
  const list = getActiveList(state);
  list.fields = normalizeFields(list.fields);

  const showNames = !!state.settings.showColumnNames;

  elements.tableHeadRow.innerHTML = "";

  if (showNames) {
    appendHeader(strings.columnName);
  }
  appendHeader(strings.selectorPreview);
  appendHeader(strings.reorder);
  appendHeader(strings.remove);

  elements.fieldsTableBody.innerHTML = "";

  if (!list.fields.length) {
    elements.emptyState.classList.remove("hidden");
    return;
  }

  elements.emptyState.classList.add("hidden");

  list.fields.forEach((field, index) => {
    const tr = document.createElement("tr");
    tr.draggable = true;
    tr.dataset.fieldId = field.id;

    tr.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", field.id);
    });

    tr.addEventListener("dragover", (event) => {
      event.preventDefault();
    });

    tr.addEventListener("drop", async (event) => {
      event.preventDefault();
      const draggedId = event.dataTransfer.getData("text/plain");
      if (!draggedId || draggedId === field.id) return;

      const current = [...list.fields];
      const fromIndex = current.findIndex((item) => item.id === draggedId);
      const toIndex = current.findIndex((item) => item.id === field.id);
      const [moved] = current.splice(fromIndex, 1);
      current.splice(toIndex, 0, moved);

      list.fields = normalizeFields(current);
      await setState(state);
      render();
    });

    if (showNames) {
      const nameTd = document.createElement("td");
      nameTd.textContent = field.columnName;
      tr.appendChild(nameTd);
    }

    const selectorTd = document.createElement("td");
    const selectorSpan = document.createElement("span");
    selectorSpan.className = "selector-preview";
    selectorSpan.textContent = field.previewLabel || selectorPreview(field.selectorBundle);
    selectorSpan.title = selectorTooltip(field.selectorBundle);
    selectorTd.appendChild(selectorSpan);
    tr.appendChild(selectorTd);

    const dragTd = document.createElement("td");
    const dragSpan = document.createElement("span");
    dragSpan.className = "drag-handle";
    dragSpan.textContent = "≡";
    dragTd.appendChild(dragSpan);
    tr.appendChild(dragTd);

    const deleteTd = document.createElement("td");
    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.textContent = "✕";
    deleteButton.addEventListener("click", async () => {
      const removed = list.fields[index];
      list.fields = list.fields.filter((item) => item.id !== removed.id);
      list.fields = normalizeFields(list.fields);

      state.pendingDelete = {
        field: removed,
        index
      };

      await setState(state);
      showToast(strings.fieldRemoved);
      render();

      setTimeout(async () => {
        const latest = await getState();
        if (latest.pendingDelete?.field?.id === removed.id) {
          latest.pendingDelete = null;
          state = latest;
          await setState(state);
          hideToast();
        }
      }, 5000);
    });

    deleteTd.appendChild(deleteButton);
    tr.appendChild(deleteTd);

    elements.fieldsTableBody.appendChild(tr);
  });
}

function appendHeader(text) {
  const th = document.createElement("th");
  th.textContent = text;
  elements.tableHeadRow.appendChild(th);
}

function showToast(message) {
  elements.toastText.textContent = message;
  elements.toast.classList.remove("hidden");
}

function hideToast() {
  elements.toast.classList.add("hidden");
}

async function handlePickedField(selectorBundle, requestedColumnName = "") {
  await refreshState();

  const template = getActiveTemplate(state);
  const list = getActiveList(state);

  const existing = list.fields.find((field) => areSelectorBundlesSimilar(field.selectorBundle, selectorBundle));

  if (existing) {
    const action = await openDuplicateDialog();
    if (action === "cancel") return;

    if (action === "update") {
      existing.selectorBundle = selectorBundle;
      existing.previewLabel = selectorPreview(selectorBundle);
      existing.updatedAt = Date.now();

      if (!existing.columnName) {
        existing.columnName = requestedColumnName || nextGenericColumnName(list.fields);
      }

      await setState(state);
      render();
      return;
    }
  }

  let columnName = requestedColumnName || "";

  if (!columnName && state.settings.showColumnNames) {
    columnName = await openNameDialog(strings.columnName, strings.chooseColumnName, "");
  }

  if (!columnName) {
    columnName = nextGenericColumnName(list.fields);
  }

  list.fields.push({
    id: uuid("fld"),
    columnName,
    order: list.fields.length,
    selectorBundle,
    previewLabel: selectorPreview(selectorBundle),
    createdAt: Date.now(),
    updatedAt: Date.now()
  });

  list.fields = normalizeFields(list.fields);
  await setState(state);
  render();
}

function openNameDialog(title, label, initialValue = "") {
  return new Promise((resolve) => {
    elements.nameDialogTitle.textContent = title;
    elements.nameDialogLabel.textContent = label;
    elements.nameDialogInput.value = initialValue;
    elements.nameDialog.showModal();

    const handler = () => {
      const value = elements.nameDialog.returnValue === "ok"
        ? elements.nameDialogInput.value.trim()
        : "";
      elements.nameDialog.removeEventListener("close", handler);
      resolve(value);
    };

    elements.nameDialog.addEventListener("close", handler);
  });
}

function openDuplicateDialog() {
  return new Promise((resolve) => {
    elements.duplicateDialog.showModal();

    const handler = () => {
      const value = elements.duplicateDialog.returnValue || "cancel";
      elements.duplicateDialog.removeEventListener("close", handler);
      resolve(value);
    };

    elements.duplicateDialog.addEventListener("close", handler);
  });
}