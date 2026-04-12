chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === "OFFSCREEN_WRITE_CLIPBOARD") {
      await navigator.clipboard.writeText(message.text || "");
      sendResponse({ ok: true });
      return;
    }
  })();

  return true;
});