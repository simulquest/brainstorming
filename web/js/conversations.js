// src/conversations.js - Gestion de la barre latérale (CRUD conversations)
import { elements, data, state, generateId } from './state.js';
import { saveData } from './persistence.js';
import { renderTranscript, updateConversationUI, toggleActionButtons, setButtonState, setStatus, setConnectionState } from './ui.js';
import { stopMicrophone } from './audio.js';
import { refreshMermaidDisplay } from './mermaid.js';

export const renderSidebar = () => {
  if (!elements.conversationList) return;
  elements.conversationList.innerHTML = '';

  data.conversations.forEach((conv) => {
    const li = document.createElement('li');
    li.className = `conv-item${conv.id === data.activeId ? ' active' : ''}`;
    li.dataset.id = conv.id;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'conv-name';
    nameSpan.textContent = conv.name || 'Sans titre';

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'conv-actions';

    const renameBtn = document.createElement('button');
    renameBtn.className = 'rename-btn';
    renameBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
    renameBtn.title = 'Renommer';
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      renameConversation(conv.id);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
    deleteBtn.title = 'Supprimer';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteConversation(conv.id);
    });

    actionsDiv.appendChild(renameBtn);
    actionsDiv.appendChild(deleteBtn);
    li.appendChild(nameSpan);
    li.appendChild(actionsDiv);
    li.addEventListener('click', () => switchConversation(conv.id));
    elements.conversationList.appendChild(li);
  });
};

const resetListening = () => {
  stopMicrophone();
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
  setConnectionState(false);
  state.isListening = false;
  setButtonState();
};

export const switchConversation = (id) => {
  if (data.activeId === id) return;

  resetListening();

  saveData();
  data.activeId = id;

  renderTranscript();
  renderSidebar();
  updateConversationUI();
  toggleActionButtons();
  setStatus('Prêt à démarrer');
  saveData();
  refreshMermaidDisplay();
};

export const renameConversation = (id) => {
  const conv = data.conversations.find((c) => c.id === id);
  if (!conv) return;

  const newName = prompt('Nouveau nom de la conversation', conv.name);
  if (newName !== null && newName.trim() !== '') {
    conv.name = newName.trim();
    saveData();
    renderSidebar();
    updateConversationUI();
  }
};

export const deleteConversation = (id) => {
  if (!confirm('Supprimer définitivement cette conversation ?')) return;
  const index = data.conversations.findIndex((c) => c.id === id);
  if (index === -1) return;
  data.conversations.splice(index, 1);

  if (data.activeId === id) {
    if (data.conversations.length > 0) {
      data.activeId = data.conversations[0].id;
    } else {
      const newConv = {
        id: generateId(),
        name: 'Nouvelle conversation',
        messages: [],
        reportText: '',
        mermaidCode: '',
      };
      data.conversations.push(newConv);
      data.activeId = newConv.id;
    }
    resetListening();
  }

  renderTranscript();
  renderSidebar();
  updateConversationUI();
  toggleActionButtons();
  saveData();
  refreshMermaidDisplay();
};

export const newConversation = () => {
  const name = prompt('Nom de la nouvelle conversation', 'Nouvelle conversation');
  if (name === null) return;

  const id = generateId();
  const newConv = {
    id,
    name: name.trim() || 'Nouvelle conversation',
    messages: [],
    reportText: '',
    mermaidCode: '',
  };
  data.conversations.push(newConv);
  data.activeId = id;

  saveData();
  renderTranscript();
  renderSidebar();
  updateConversationUI();
  toggleActionButtons();
  setStatus('Prêt à démarrer');
  refreshMermaidDisplay();
};