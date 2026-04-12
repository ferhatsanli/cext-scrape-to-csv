export const DEFAULT_SETTINGS = {
  language: "en",
  showColumnNames: true
};

export const DEFAULT_TEMPLATE = {
  id: "tpl_linkedin",
  name: "LinkedIn Jobs",
  urlMatch: "www.linkedin.com",
  lists: [
    {
      id: "list_default",
      name: "Default",
      fields: []
    }
  ]
};

export const DEFAULT_STATE = {
  settings: DEFAULT_SETTINGS,
  templates: [DEFAULT_TEMPLATE],
  activeTemplateId: "tpl_linkedin",
  activeListId: "list_default",
  pendingUndo: null
};

export async function ensureState() {
  const data = await chrome.storage.local.get([
    "settings",
    "templates",
    "activeTemplateId",
    "activeListId",
    "pendingUndo"
  ]);

  const state = {
    settings: data.settings || DEFAULT_STATE.settings,
    templates: data.templates || DEFAULT_STATE.templates,
    activeTemplateId: data.activeTemplateId || DEFAULT_STATE.activeTemplateId,
    activeListId: data.activeListId || DEFAULT_STATE.activeListId,
    pendingUndo: data.pendingUndo || null
  };

  await chrome.storage.local.set(state);
  return state;
}

export async function getState() {
  return ensureState();
}

export async function saveState(partial) {
  await chrome.storage.local.set(partial);
  return getState();
}

export function makeId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function findTemplate(state, templateId) {
  return state.templates.find((t) => t.id === templateId) || null;
}

export function findList(template, listId) {
  return template?.lists?.find((l) => l.id === listId) || null;
}

export function getActiveTemplate(state) {
  return findTemplate(state, state.activeTemplateId);
}

export function getActiveList(state) {
  const template = getActiveTemplate(state);
  return findList(template, state.activeListId);
}

export async function updateSettings(nextSettings) {
  const state = await getState();
  const settings = { ...state.settings, ...nextSettings };
  await saveState({ settings });
  return settings;
}

export async function setActiveTemplate(templateId) {
  const state = await getState();
  const template = findTemplate(state, templateId);
  if (!template) throw new Error("Template not found");

  const firstListId = template.lists?.[0]?.id || null;
  await saveState({
    activeTemplateId: templateId,
    activeListId: firstListId
  });
}

export async function setActiveList(listId) {
  const state = await getState();
  const template = getActiveTemplate(state);
  const list = findList(template, listId);
  if (!list) throw new Error("List not found");
  await saveState({ activeListId: listId });
}

export async function createList(name) {
  const state = await getState();
  const templates = deepClone(state.templates);
  const template = templates.find((t) => t.id === state.activeTemplateId);
  if (!template) throw new Error("Active template not found");

  const list = {
    id: makeId("list"),
    name: name?.trim() || "Untitled",
    fields: []
  };

  template.lists.push(list);

  await saveState({
    templates,
    activeListId: list.id
  });

  return list;
}

export async function renameList(listId, name) {
  const state = await getState();
  const templates = deepClone(state.templates);
  const template = templates.find((t) => t.id === state.activeTemplateId);
  const list = template?.lists.find((l) => l.id === listId);
  if (!list) throw new Error("List not found");

  list.name = name?.trim() || list.name;
  await saveState({ templates });
}

export async function deleteList(listId) {
  const state = await getState();
  const templates = deepClone(state.templates);
  const template = templates.find((t) => t.id === state.activeTemplateId);
  if (!template) throw new Error("Active template not found");

  if (template.lists.length <= 1) {
    throw new Error("At least one list must remain");
  }

  template.lists = template.lists.filter((l) => l.id !== listId);
  const nextListId = template.lists[0].id;

  await saveState({
    templates,
    activeListId: nextListId
  });
}

export async function updateTemplateUrlMatch(templateId, urlMatch) {
  const state = await getState();
  const templates = deepClone(state.templates);
  const template = templates.find((t) => t.id === templateId);
  if (!template) throw new Error("Template not found");

  template.urlMatch = urlMatch.trim();
  await saveState({ templates });
}

export async function createTemplate(name, urlMatch) {
  const state = await getState();
  const templates = deepClone(state.templates);

  const template = {
    id: makeId("tpl"),
    name: name?.trim() || "Untitled Template",
    urlMatch: urlMatch?.trim() || "",
    lists: [
      {
        id: makeId("list"),
        name: "Default",
        fields: []
      }
    ]
  };

  templates.push(template);

  await saveState({
    templates,
    activeTemplateId: template.id,
    activeListId: template.lists[0].id
  });

  return template;
}

export async function renameTemplate(templateId, name) {
  const state = await getState();
  const templates = deepClone(state.templates);
  const template = templates.find((t) => t.id === templateId);
  if (!template) throw new Error("Template not found");

  template.name = name?.trim() || template.name;
  await saveState({ templates });
}

export async function deleteTemplate(templateId) {
  const state = await getState();
  const templates = deepClone(state.templates);

  if (templates.length <= 1) {
    throw new Error("At least one template must remain");
  }

  const nextTemplates = templates.filter((t) => t.id !== templateId);
  const nextTemplate = nextTemplates[0];

  await saveState({
    templates: nextTemplates,
    activeTemplateId: nextTemplate.id,
    activeListId: nextTemplate.lists[0]?.id || null
  });
}

export function nextGenericColumnName(fields) {
  let index = 1;
  const existing = new Set(fields.map((f) => f.columnName));
  while (true) {
    const name = `column${String(index).padStart(2, "0")}`;
    if (!existing.has(name)) return name;
    index += 1;
  }
}

export async function upsertField({
  templateId,
  listId,
  field,
  mode = "create"
}) {
  const state = await getState();
  const templates = deepClone(state.templates);
  const template = templates.find((t) => t.id === templateId);
  const list = template?.lists.find((l) => l.id === listId);

  if (!template || !list) throw new Error("Template or list not found");

  if (mode === "update" && field.id) {
    const idx = list.fields.findIndex((f) => f.id === field.id);
    if (idx >= 0) {
      list.fields[idx] = {
        ...list.fields[idx],
        ...field,
        updatedAt: Date.now()
      };
    } else {
      throw new Error("Field to update not found");
    }
  } else {
    list.fields.push({
      ...field,
      id: field.id || makeId("fld"),
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }

  normalizeFieldOrder(list.fields);
  await saveState({ templates });
}

export async function deleteField(templateId, listId, fieldId) {
  const state = await getState();
  const templates = deepClone(state.templates);
  const template = templates.find((t) => t.id === templateId);
  const list = template?.lists.find((l) => l.id === listId);

  if (!template || !list) throw new Error("Template or list not found");

  const deletedField = list.fields.find((f) => f.id === fieldId);
  list.fields = list.fields.filter((f) => f.id !== fieldId);
  normalizeFieldOrder(list.fields);

  await saveState({
    templates,
    pendingUndo: {
      type: "field_delete",
      templateId,
      listId,
      field: deletedField,
      expiresAt: Date.now() + 5000
    }
  });
}

export async function undoPendingDelete() {
  const state = await getState();
  const undo = state.pendingUndo;
  if (!undo) return false;
  if (Date.now() > undo.expiresAt) {
    await clearPendingUndo();
    return false;
  }

  if (undo.type === "field_delete") {
    const templates = deepClone(state.templates);
    const template = templates.find((t) => t.id === undo.templateId);
    const list = template?.lists.find((l) => l.id === undo.listId);
    if (!template || !list) return false;

    list.fields.push(undo.field);
    normalizeFieldOrder(list.fields);

    await saveState({
      templates,
      pendingUndo: null
    });

    return true;
  }

  return false;
}

export async function clearPendingUndo() {
  await saveState({ pendingUndo: null });
}

export async function reorderFields(templateId, listId, orderedIds) {
  const state = await getState();
  const templates = deepClone(state.templates);
  const template = templates.find((t) => t.id === templateId);
  const list = template?.lists.find((l) => l.id === listId);
  if (!template || !list) throw new Error("Template or list not found");

  const map = new Map(list.fields.map((f) => [f.id, f]));
  list.fields = orderedIds.map((id) => map.get(id)).filter(Boolean);
  normalizeFieldOrder(list.fields);

  await saveState({ templates });
}

export function normalizeFieldOrder(fields) {
  fields.sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
  fields.forEach((field, index) => {
    field.order = index + 1;
  });
}