import { getState, setState, getLanguageStrings } from "./shared.js";

let state = await getState();
let strings = getLanguageStrings(state.settings.language);

const elements = {
  settingsTitle: document.getElementById("settingsTitle"),
  languageTitle: document.getElementById("languageTitle"),
  languageSelect: document.getElementById("languageSelect"),
  templateMatchesTitle: document.getElementById("templateMatchesTitle"),
  templateNameHeader: document.getElementById("templateNameHeader"),
  urlMatchHeader: document.getElementById("urlMatchHeader"),
  templateTableBody: document.getElementById("templateTableBody"),
  saveButton: document.getElementById("saveButton"),
  saveStatus: document.getElementById("saveStatus")
};

bindEvents();
render();

function bindEvents() {
  elements.languageSelect.addEventListener("change", () => {
    state.settings.language = elements.languageSelect.value;
    strings = getLanguageStrings(state.settings.language);
    render();
  });

  elements.saveButton.addEventListener("click", async () => {
    const rows = [...elements.templateTableBody.querySelectorAll("tr")];
    rows.forEach((row) => {
      const templateId = row.dataset.templateId;
      const input = row.querySelector("input");
      const template = state.templates.find((item) => item.id === templateId);
      if (template) {
        template.urlMatch = input.value.trim();
      }
    });

    await setState(state);
    elements.saveStatus.textContent = strings.saved;

    setTimeout(() => {
      elements.saveStatus.textContent = "";
    }, 1500);
  });
}

function render() {
  strings = getLanguageStrings(state.settings.language);

  elements.settingsTitle.textContent = strings.settingsTitle;
  elements.languageTitle.textContent = strings.language;
  elements.templateMatchesTitle.textContent = strings.templateMatches;
  elements.templateNameHeader.textContent = strings.templateName;
  elements.urlMatchHeader.textContent = strings.urlMatch;
  elements.saveButton.textContent = strings.save;
  elements.languageSelect.value = state.settings.language;

  elements.templateTableBody.innerHTML = "";

  for (const template of state.templates) {
    const tr = document.createElement("tr");
    tr.dataset.templateId = template.id;

    const nameTd = document.createElement("td");
    nameTd.textContent = template.name;

    const urlTd = document.createElement("td");
    const input = document.createElement("input");
    input.type = "text";
    input.value = template.urlMatch || "";
    input.placeholder = "www.linkedin.com";
    urlTd.appendChild(input);

    tr.appendChild(nameTd);
    tr.appendChild(urlTd);
    elements.templateTableBody.appendChild(tr);
  }
}