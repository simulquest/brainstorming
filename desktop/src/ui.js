// src/ui.js - Rendu de l'interface (statut, boutons, transcription)
import { elements, state, getActiveConversation, getCurrentMessages } from './state.js';

export const setStatus = (message, isError = false) => {
  if (!elements.statusElement) return;
  elements.statusElement.textContent = message;
  elements.statusElement.className = `result${isError ? ' error' : ''}`;
};

export const setConnectionState = (connected) => {
  if (!elements.connectionIndicator) return;
  elements.connectionIndicator.textContent = connected ? 'Connecté' : 'Hors ligne';
  elements.connectionIndicator.className = connected ? 'status-pill connected' : 'status-pill';
};

export const setButtonState = () => {
  if (elements.startButton) elements.startButton.disabled = state.isListening;
  if (elements.stopButton) elements.stopButton.disabled = !state.isListening;
};

export const updateConversationUI = () => {
  const active = getActiveConversation();
  const messages = active ? active.messages : [];

  if (elements.convTitle) {
    elements.convTitle.textContent = active ? active.name : 'Voice Chat';
  }
  if (elements.convMeta) {
    elements.convMeta.textContent = active
      ? `${messages.length} message${messages.length > 1 ? 's' : ''}`
      : 'Parlez, le modèle répond en voix';
  }
  if (elements.messageCount) {
    elements.messageCount.textContent = active
      ? `${messages.length} message${messages.length !== 1 ? 's' : ''}`
      : '0 message';
  }
  if (elements.reportTextElement) {
    elements.reportTextElement.textContent = active?.reportText || '';
  }
};

export const toggleActionButtons = () => {
  const visible = getCurrentMessages().length > 0;
  if (elements.downloadButton) elements.downloadButton.classList.toggle('hidden', !visible);
  if (elements.generateReportButton) elements.generateReportButton.classList.toggle('hidden', !visible);
  if (elements.generateMermaidButton) elements.generateMermaidButton.classList.toggle('hidden', !visible);
  if (elements.downloadSummaryButton) elements.downloadSummaryButton.classList.toggle('hidden', !visible);
  if (elements.downloadGraphButton) elements.downloadGraphButton.classList.toggle('hidden', !visible);
};

export const renderTranscript = () => {
  if (!elements.transcriptElement) return;
  elements.transcriptElement.innerHTML = '';

  const messages = getCurrentMessages();

  if (!messages.length) {
    elements.transcriptElement.innerHTML = 'Aucune conversation enregistrée pour le moment.';
  } else {
    messages.forEach((entry) => {
      const messageEl = document.createElement('div');
      messageEl.className = `message message-${entry.role}`;

      const roleLabel = document.createElement('div');
      roleLabel.className = 'message-role';
      roleLabel.textContent = entry.role === 'ai' ? 'Assistant' : 'Vous';

      const content = document.createElement('div');
      content.textContent = entry.content;

      messageEl.appendChild(roleLabel);
      messageEl.appendChild(content);
      elements.transcriptElement.appendChild(messageEl);
    });

    elements.transcriptElement.scrollTop = elements.transcriptElement.scrollHeight;
  }

  updateConversationUI();
};