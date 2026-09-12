// src/transcript.js - Ajout de messages et mise en forme Markdown
import { data, getActiveConversation, getCurrentMessages } from './state.js';
import { renderTranscript, toggleActionButtons } from './ui.js';
import { saveData } from './persistence.js';

// Concatène le texte arrivant en streaming pour un même rôle
export const appendConversationEntry = (role, content) => {
  if (!content) return;

  const active = getActiveConversation();
  if (!active) {
    console.error('Aucune conversation active trouvée');
    return;
  }

  const lastEntry = active.messages[active.messages.length - 1];

  if (lastEntry && lastEntry.role === role) {
    lastEntry.content += content;
  } else {
    active.messages.push({ role, content: content });
  }

  renderTranscript();
  toggleActionButtons();
  saveData();
};

export const buildMarkdownTranscript = () =>
  getCurrentMessages()
    .map((entry) => `**${entry.role === 'ai' ? 'AI' : 'Human'}:** ${entry.content}`)
    .join('\n\n');