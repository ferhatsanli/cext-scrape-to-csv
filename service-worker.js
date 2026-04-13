import {
  getState,
  getActiveTemplate,
  getActiveList,
  nextGenericColumnName,
  upsertField
} from "./storage.js";

import { isDuplicateField } from "./selectors.js";

chrome.commands.onCommand.addListener(async (command) => {
  try {
    if (command === "select-element") {
      await startSelectionMode();
    } else if (command === "scrape-now") {
      await scrapeNowAndCopy();
    }
  } catch (error) {
    console.error("Command error:", error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "START_SELECTION_MODE") {
    startSelectionMode()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "SCRAPE_NOW") {
    scrapeNowAndCopy()
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "ELEMENT_SELECTED") {
    handleElementSelected(message.payload, sender)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab?.id) {
    throw new Error("Active tab not found");
  }

  return tab;
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content-script.js"]
    });
  }
}

async function startSelectionMode() {
  const tab = await getActiveTab();
  await ensureContentScript(tab.id);

  await chrome.tabs.sendMessage(tab.id, {
    type: "ENTER_SELECTION_MODE"
  });
}

async function scrapeNowAndCopy() {
  const state = await getState();
  const template = getActiveTemplate(state);
  const list = getActiveList(state);

  if (!template || !list) {
    throw new Error("Active template or list not found");
  }

  if (!list.fields?.length) {
    throw new Error("No fields defined in the active list");
  }

  const tab = await getActiveTab();
  await ensureContentScript(tab.id);

  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "SCRAPE_FIELDS",
    payload: {
      template,
      list,
      settings: state.settings
    }
  });

  return response;
}

async function handleElementSelected(payload, sender) {
  const state = await getState();
  const template = getActiveTemplate(state);
  const list = getActiveList(state);

  if (!template || !list) {
    throw new Error("Active template or list not found");
  }

  const tabId = sender?.tab?.id;
  if (!tabId) {
    throw new Error("Tab context not found");
  }

  let columnName = nextGenericColumnName(list.fields || []);

  if (state.settings.showColumnNames) {
    const promptResult = await chrome.tabs.sendMessage(tabId, {
      type: "ASK_COLUMN_NAME",
      payload: {
        defaultValue: ""
      }
    });

    if (promptResult?.action === "ok" && promptResult.value?.trim()) {
      columnName = promptResult.value.trim();
    }
  }

  const duplicate = (list.fields || []).find((field) =>
    isDuplicateField(field, payload.selectorBundle)
  );

  const baseField = {
    columnName,
    order: (list.fields?.length || 0) + 1,
    selectorBundle: payload.selectorBundle,
    previewLabel: payload.previewLabel
  };

  if (duplicate) {
    const duplicateResult = await chrome.tabs.sendMessage(tabId, {
      type: "ASK_DUPLICATE_ACTION",
      payload: {
        message: "A similar field already exists. Choose an action."
      }
    });

    if (duplicateResult?.action === "cancel") {
      return { saved: false, reason: "cancelled" };
    }

    if (duplicateResult?.action === "update") {
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

      await notify("Field updated");
      return { saved: true, mode: "update" };
    }

    if (duplicateResult?.action === "duplicate") {
      await upsertField({
        templateId: template.id,
        listId: list.id,
        mode: "create",
        field: baseField
      });

      await notify("Duplicate field created");
      return { saved: true, mode: "duplicate" };
    }

    return { saved: false, reason: "cancelled" };
  }

  await upsertField({
    templateId: template.id,
    listId: list.id,
    mode: "create",
    field: baseField
  });

  await notify("Field saved");
  return { saved: true, mode: "create" };
}

async function notify(message) {
  console.log("Job Copy Extension:", message);
  // try {
  //   await chrome.notifications.create({
  //     type: "basic",
  //     iconUrl: "icon128.png",
  //     title: "Job Copy Extension",
  //     message
  //   });
  // } catch {
  //   console.log(message);
  // }
}