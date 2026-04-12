export function promptDialog({ title = "", message = "", defaultValue = "" }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "dialog-overlay";

    const box = document.createElement("div");
    box.className = "dialog-box";

    box.innerHTML = `
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      <input class="dialog-input" type="text" value="${escapeHtml(defaultValue)}" />
      <div class="dialog-actions">
        <button class="dialog-cancel">Cancel</button>
        <button class="dialog-ok">OK</button>
      </div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const input = box.querySelector(".dialog-input");
    const cancelBtn = box.querySelector(".dialog-cancel");
    const okBtn = box.querySelector(".dialog-ok");

    input.focus();
    input.select();

    cancelBtn.addEventListener("click", () => {
      overlay.remove();
      resolve({ action: "cancel", value: null });
    });

    okBtn.addEventListener("click", () => {
      overlay.remove();
      resolve({ action: "ok", value: input.value.trim() });
    });
  });
}

export function confirmThreeWayDialog({ title = "", message = "" }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "dialog-overlay";

    const box = document.createElement("div");
    box.className = "dialog-box";

    box.innerHTML = `
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      <div class="dialog-actions">
        <button class="dialog-cancel">Cancel</button>
        <button class="dialog-duplicate">Create Duplicate</button>
        <button class="dialog-update">Update</button>
      </div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    box.querySelector(".dialog-cancel").addEventListener("click", () => {
      overlay.remove();
      resolve("cancel");
    });

    box.querySelector(".dialog-duplicate").addEventListener("click", () => {
      overlay.remove();
      resolve("duplicate");
    });

    box.querySelector(".dialog-update").addEventListener("click", () => {
      overlay.remove();
      resolve("update");
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}