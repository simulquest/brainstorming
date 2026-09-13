// src/main.js - Point d'entrée : câblage des événements et initialisation
import '@fortawesome/fontawesome-free/css/all.min.css';
import { elements, state } from './state.js';
import { loadData, saveData } from './persistence.js';
import { setConnectionState, setButtonState, toggleActionButtons, setStatus, renderTranscript, updateConversationUI } from './ui.js';
import { renderSidebar, newConversation } from './conversations.js';
import { startMicrophone, stopMicrophone, initAudioPlayback } from './audio.js';
import { connectGemini } from './gemini.js';
import { summarizeConversation } from './summary.js';
import { downloadTranscript, downloadSummary } from './download.js';
import { generateMermaidGraph, downloadGraph, refreshMermaidDisplay } from './mermaid.js';
import { openFullscreen } from './graph.js';
import './graph-chat.js';

const openSidebar = () => {
  elements.sidebar.classList.add('open');
  elements.sidebarOverlay.classList.add('visible');
  elements.menuToggle.classList.add('active');
};

const closeSidebar = () => {
  elements.sidebar.classList.remove('open');
  elements.sidebarOverlay.classList.remove('visible');
  elements.menuToggle.classList.remove('active');
};

const toggleSidebar = () => {
  if (elements.sidebar.classList.contains('open')) {
    closeSidebar();
  } else {
    openSidebar();
  }
};

// --------------------- Événements ---------------------
elements.startButton?.addEventListener('click', async () => {
  if (state.isListening) return;

  const connected = await connectGemini();
  if (!connected) return;

  state.isListening = true;
  setButtonState();
  initAudioPlayback();
  await startMicrophone();
});

elements.stopButton?.addEventListener('click', () => {
  stopMicrophone();
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
  setButtonState();
  setStatus('Écoute arrêtée.');
});

elements.downloadButton?.addEventListener('click', () => {
  downloadTranscript();
});

elements.generateReportButton?.addEventListener('click', () => {
  summarizeConversation();
});

elements.generateMermaidButton?.addEventListener('click', () => {
  generateMermaidGraph();
});

elements.downloadSummaryButton?.addEventListener('click', () => {
  downloadSummary();
});

elements.downloadGraphButton?.addEventListener('click', () => {
  downloadGraph();
});

elements.graphFullscreenButton?.addEventListener('click', () => {
  openFullscreen();
});

elements.menuToggle?.addEventListener('click', toggleSidebar);
elements.sidebarOverlay?.addEventListener('click', closeSidebar);

elements.newConversationBtn?.addEventListener('click', () => {
  newConversation();
  if (window.innerWidth < 600) closeSidebar();
});

const settingsInputs = [
  elements.apiKeyInput,
  elements.resumeApiKeyInput,
  elements.endPointInput,
  elements.modelInput,
  elements.systemInstructionText,
  elements.voiceSelect,
];
settingsInputs.forEach((input) => {
  if (!input) return;
  input.addEventListener('input', saveData);
  input.addEventListener('change', saveData);
});

// --------------------- Initialisation ---------------------
if (elements.transcriptElement) elements.transcriptElement.innerHTML = 'Aucune conversation enregistrée.';
setConnectionState(false);
setButtonState();
toggleActionButtons();
loadData();

renderTranscript();
renderSidebar();
updateConversationUI();
refreshMermaidDisplay();