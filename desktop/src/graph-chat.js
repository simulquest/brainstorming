// src/graph-chat.js - Discussion avec l'IA sur le graphique
import { elements } from './state.js';
import { setStatus } from './ui.js';
import { getSummaryApiKey, getSummaryEndpoint, getModel } from './settings.js';
import { sanitizeMermaidCode } from './mermaid.js';
import { applyGraphCode } from './graph.js';

const appendChatMessage = (text, role, mermaidBlock) => {
  if (!elements.graphChatMessages) return;
  const div = document.createElement('div');
  div.className = `graph-chat-msg ${role}`;
  const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  div.innerHTML = safe.replace(/\n/g, '<br>');

  if (mermaidBlock) {
    const pre = document.createElement('pre');
    pre.textContent = mermaidBlock;
    div.appendChild(pre);
    const btn = document.createElement('button');
    btn.className = 'graph-chat-apply';
    btn.textContent = 'Appliquer ce graphique';
    btn.addEventListener('click', () => {
      if (elements.graphCodeEditor) elements.graphCodeEditor.value = mermaidBlock;
      applyGraphCode();
    });
    div.appendChild(btn);
  }

  elements.graphChatMessages.appendChild(div);
  elements.graphChatMessages.scrollTop = elements.graphChatMessages.scrollHeight;
};

const extractMermaidCode = (raw) => {
  const match = String(raw ?? '').match(/```(?:mermaid)?\s*([\s\S]*?)```/i);
  const code = match ? match[1].trim() : null;
  return code ? sanitizeMermaidCode(code) : null;
};

export const sendGraphChat = async () => {
  const question = elements.graphChatInput?.value.trim();
  if (!question) return;

  const apiKey = getSummaryApiKey();
  if (!apiKey) {
    setStatus('Veuillez saisir la clé API de résumé.', true);
    return;
  }

  appendChatMessage(question, 'user');
  if (elements.graphChatInput) elements.graphChatInput.value = '';

  const currentCode = elements.graphCodeEditor?.value || '';
  const systemPrompt = `Tu es un assistant expert en diagrammes Mermaid. Tu as sous les yeux le code Mermaid du graphique en cours. Tu réponds en français, de façon concise.
- Si tu proposes des modifications (ajouter/supprimer/modifier des composants ou des liens), renvoie le code Mermaid COMPLET et CORRIGÉ dans un bloc de code \`\`\`mermaid ... \`\`\`, rien d'autre.
- Tu peux aussi décrire le graphique ou répondre à des questions à son sujet.`;

  appendChatMessage('Réflexion en cours…', 'ai');

  try {
    const response = await fetch(getSummaryEndpoint().trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: getModel(),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Voici le graphique actuel :\n${currentCode}\n\nQuestion : ${question}` },
        ],
        temperature: 0.3,
      }),
    });

    const rawText = await response.text();
    let result = null;
    try {
      result = rawText ? JSON.parse(rawText) : null;
    } catch {
      result = null;
    }
    if (!response.ok) {
      const err = result?.error;
      const errorMessage =
        (typeof err === 'string' && err.trim()) ||
        err?.message ||
        result?.message ||
        (rawText && rawText.trim().length < 500 ? rawText.trim() : null) ||
        "Erreur lors de l'appel au modèle.";
      appendChatMessage(errorMessage, 'ai');
      return;
    }

    const reply = result.choices?.[0]?.message?.content || result.choices?.[0]?.text || '';
    const block = extractMermaidCode(reply);
    const text = block ? reply.replace(/```mermaid\s*[\s\S]*?```/i, '').trim() : reply;
    if (elements.graphChatMessages) elements.graphChatMessages.lastChild?.remove();
    appendChatMessage(text || 'Code Mermaid mis à jour :', 'ai', block);
  } catch (error) {
    console.error('Erreur chat IA :', error);
    if (elements.graphChatMessages) elements.graphChatMessages.lastChild?.remove();
    appendChatMessage("Impossible de contacter l'IA.", 'ai');
  }
};

// --------------------- Événements ---------------------
elements.graphChatSend?.addEventListener('click', () => sendGraphChat());
elements.graphChatInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendGraphChat();
});