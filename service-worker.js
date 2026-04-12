import {
  getState,
  setState,
  getActiveTemplate,
  getActiveList,
  getTemplateForUrl,
  normalizeFields,
  nextGenericColumnName,
  selectorPreview,
  toCsvLine,
  uuid
} from "./shared.js";

chrome.runtime.onInstalled.addListener(async () => {
  await getState();
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab?.url) return;

  if (command === "start-pick-mode") {
    await startPickMode(tab.id, tab.url);
  }

  if (command === "scrape-now") {
    await scrapeAndCopy(tab.id, tab.url);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === "POPUP_START_PICK_MODE") {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab?.url) {
        sendResponse({ ok: false, error: "No active tab" });
        return;
      }
      await startPickMode(tab.id, tab.url);
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "POPUP_SCRAPE_NOW") {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab?.url) {
        sendResponse({ ok: false, error: "No active tab" });
        return;
      }
      const result = await scrapeAndCopy(tab.id, tab.url);
      sendResponse(result);
      return;
    }

    if (message.type === "WRITE_CLIPBOARD") {
      await writeClipboard(message.text || "");
      sendResponse({ ok: true });
      return;
    }
  })();

  return true;
});

async function injectContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content-script.js"]
  });
}

async function startPickMode(tabId, url) {
  const state = await getState();
  const matchedTemplate = getTemplateForUrl(state, url);

  if (matchedTemplate) {
    state.activeTemplateId = matchedTemplate.id;
    if (!matchedTemplate.lists.some((l) => l.id === state.activeListId)) {
      state.activeListId = matchedTemplate.lists[0]?.id;
    }
    await setState(state);
  }

  await injectContentScript(tabId);

  await chrome.tabs.sendMessage(tabId, {
    type: "START_PICK_MODE"
  });
}

async function scrapeAndCopy(tabId, url) {
  const state = await getState();
  const template = getTemplateForUrl(state, url) || getActiveTemplate(state);
  const list = template.lists.find((l) => l.id === state.activeListId) || template.lists[0];

  if (!list || !list.fields.length) {
    return { ok: false, error: "No fields configured" };
  }

  await injectContentScript(tabId);

  const response = await chrome.tabs.sendMessage(tabId, {
    type: "SCRAPE_FIELDS",
    fields: list.fields
  });

  if (!response?.ok) {
    return { ok: false, error: response?.error || "Scrape failed" };
  }

  const values = response.values || [];
  let payload = "";

  if (state.settings.showColumnNames) {
    payload = [
      toCsvLine(list.fields.map((f) => f.columnName)),
      toCsvLine(values)
    ].join("\n");
  } else {
    payload = toCsvLine(values);
  }

  await writeClipboard(payload);
  return { ok: true, text: payload };
}

async function ensureOffscreenDocument() {
  const url = chrome.runtime.getURL("offscreen.html");
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [url]
  });

  if (contexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["CLIPBOARD"],
    justification: "Write captured CSV data to the clipboard."
  });
}

async function writeClipboard(text) {
  await ensureOffscreenDocument();
  await chrome.runtime.sendMessage({
    type: "OFFSCREEN_WRITE_CLIPBOARD",
    text
  });
}