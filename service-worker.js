import {
  getState,
  getActiveTemplate,
  getActiveList
} from "./storage.js";

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
    startSelectionMode().then(() => sendResponse({ ok: true })).catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }

  if (message?.type === "SCRAPE_NOW") {
    scrapeNowAndCopy().then((result) => {
      sendResponse({ ok: true, result });
    }).catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });
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