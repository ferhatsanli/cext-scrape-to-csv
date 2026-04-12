import { getState, updateSettings, saveState } from "./storage.js";
import { t } from "./i18n.js";

const refs = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheRefs();
  bindEvents();
  await render();
}

function cacheRefs() {
  refs.settingsTitle = document.getElementById("settingsTitle");
  refs.languageLabel = document.getElementById("languageLabel");
  refs.languageSelect = document.getElementById("languageSelect");
  refs.templateMatchesTitle = document.getElementById("templateMatchesTitle");
  refs.templateNameHeader = document.getElementById("templateNameHeader");
  refs.urlMatchHeader = document.getElementById("urlMatchHeader");
  refs.templatesTbody = document.getElementById("templatesTbody");
  refs.saveTemplatesBtn = document.getElementById("saveTemplatesBtn");
}

function bindEvents() {
  refs.languageSelect.addEventListener("change", async (e) => {
    await updateSettings({ language: e.target.value });
    await render();
  });

  refs.saveTemplatesBtn.addEventListener("click", async () => {
    const state = await getState();
    const templates = state.templates.map((template) => {
      const input = document.querySelector(`input[data-template-id="${template.id}"]`);
      return {
        ...template,
        urlMatch: input?.value?.trim() || template.urlMatch
      };
    });

    await saveState({ templates });
    alert("Saved");
  });
}

async function render() {
  const state = await getState();
  const lang = state.settings.language;

  refs.settingsTitle.textContent = t(lang, "settings");
  refs.languageLabel.textContent = t(lang, "language");
  refs.templateMatchesTitle.textContent = t(lang, "templateMatches");
  refs.templateNameHeader.textContent = t(lang, "nameTemplate");
  refs.urlMatchHeader.textContent = t(lang, "urlMatch");
  refs.saveTemplatesBtn.textContent = t(lang, "ok");

  refs.languageSelect.value = lang;

  refs.templatesTbody.innerHTML = state.templates.map((template) => `
    <tr>
      <td>${escapeHtml(template.name)}</td>
      <td>
        <input
          type="text"
          data-template-id="${template.id}"
          value="${escapeHtml(template.urlMatch || "")}"
        />
      </td>
    </tr>
  `).join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}