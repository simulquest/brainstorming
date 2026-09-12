// src/persistence.js - Sauvegarde / chargement dans localStorage
import { STORAGE_KEY, data, elements, generateId, getActiveConversation } from './state.js';
export const saveData = () => {
  data.settings.apiKey = elements.apiKeyInput?.value.trim() || '';
  data.settings.summaryApiKey = elements.resumeApiKeyInput?.value.trim() || '';
  data.settings.endpoint = elements.endPointInput?.value.trim() || 'https://api.openai.com/v1/chat/completions';
  data.settings.model = elements.modelInput?.value.trim() || 'openai-fast';
  data.settings.systemInstruction = elements.systemInstructionText?.value.trim() || 'Vous êtes un assistant utile, clair et concis.';
  data.settings.voiceName = elements.voiceSelect?.value.trim() || 'Aoede';

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Impossible de sauvegarder les données', e);
  }
};

export const loadData = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === 'object') {
      data.settings = { ...data.settings, ...(saved.settings || {}) };
      data.activeId = saved.activeId || null;
      data.conversations = Array.isArray(saved.conversations) ? saved.conversations : [];
    }
  } catch (e) {
    console.warn('Impossible de charger les données', e);
  }

  if (data.conversations.length === 0) {
    const defaultConv = {
      id: generateId(),
      name: 'Nouvelle conversation',
      messages: [],
      reportText: '',
      mermaidCode: '',
    };
    data.conversations.push(defaultConv);
    data.activeId = defaultConv.id;
  } else if (!data.activeId || !data.conversations.find((c) => c.id === data.activeId)) {
    data.activeId = data.conversations[0].id;
  }

  if (elements.apiKeyInput) elements.apiKeyInput.value = data.settings.apiKey;
  if (elements.resumeApiKeyInput) elements.resumeApiKeyInput.value = data.settings.summaryApiKey;
  if (elements.endPointInput) elements.endPointInput.value = data.settings.endpoint;
  if (elements.modelInput) elements.modelInput.value = data.settings.model;
  if (elements.systemInstructionText) elements.systemInstructionText.value = data.settings.systemInstruction;
  if (elements.voiceSelect) elements.voiceSelect.value = data.settings.voiceName || 'Aoede';

  const active = getActiveConversation();
  if (active && elements.reportTextElement) {
    elements.reportTextElement.textContent = active.reportText || '';
  }
};