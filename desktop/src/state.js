// src/state.js - État partagé (data, state, éléments DOM)

export const elements = {
  startButton: document.getElementById('btn-voice-start'),
  stopButton: document.getElementById('btn-voice-stop'),
  statusElement: document.getElementById('voice-status'),
  transcriptElement: document.getElementById('voice-transcript'),
  downloadButton: document.getElementById('btn-download-conv'),
  generateReportButton: document.getElementById('btn-generate-report'),
  reportTextElement: document.getElementById('report-text'),
  apiKeyInput: document.getElementById('api-key-input'),
  endPointInput: document.getElementById('end-point-input'),
  resumeApiKeyInput: document.getElementById('api-key-resume-input'),
  modelInput: document.getElementById('model-input'),
  systemInstructionText: document.getElementById('system-instruction-text'),
  audioLevel: document.getElementById('audio-level'),
  connectionIndicator: document.getElementById('connection-indicator'),
  menuToggle: document.getElementById('menu-toggle'),
  sidebar: document.getElementById('sidebar'),
  sidebarOverlay: document.getElementById('sidebar-overlay'),
  newConversationBtn: document.getElementById('new-conversation-btn'),
  conversationList: document.getElementById('conversation-list'),
  convTitle: document.getElementById('conv-title'),
  convMeta: document.getElementById('conv-meta'),
  messageCount: document.getElementById('message-count'),
  generateMermaidButton: document.getElementById('btn-generate-mermaid'),
  downloadSummaryButton: document.getElementById('btn-download-summary'),
  downloadGraphButton: document.getElementById('btn-download-graph'),
  mermaidContainer: document.getElementById('mermaid-container'),
  mermaidDiagramElement: document.getElementById('mermaid-diagram'),
  mermaidCodeElement: document.getElementById('mermaid-code'),
  graphFullscreenButton: document.getElementById('btn-graph-fullscreen'),
  graphOverlay: document.getElementById('graph-overlay'),
  graphCanvas: document.getElementById('graph-canvas'),
  graphRender: document.getElementById('graph-render'),
  graphCodeEditor: document.getElementById('graph-code'),
  graphApply: document.getElementById('graph-apply'),
  graphClose: document.getElementById('graph-close'),
  graphZoomIn: document.getElementById('graph-zoom-in'),
  graphZoomOut: document.getElementById('graph-zoom-out'),
  graphZoomReset: document.getElementById('graph-zoom-reset'),
  graphZoomLevel: document.getElementById('graph-zoom-level'),
  graphChatMessages: document.getElementById('graph-chat-messages'),
  graphChatInput: document.getElementById('graph-chat-input'),
  graphChatSend: document.getElementById('graph-chat-send'),
  graphBranches: document.getElementById('graph-branches'),
  graphBranchesList: document.getElementById('graph-branches-list'),
  graphBranchesAll: document.getElementById('graph-branches-all'),
  graphBranchesNone: document.getElementById('graph-branches-none'),
  voiceSelect: document.getElementById('voice-select'),
};

export const STORAGE_KEY = 'brainstorming-data';

export const state = {
  ws: null,
  isListening: false,
  mediaStream: null,
  recordAudioCtx: null,
  scriptProcessor: null,
  playAudioCtx: null,
  nextPlayTime: 0,
};

export const data = {
  settings: {
    apiKey: '',
    summaryApiKey: '',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'openai-fast',
    systemInstruction: 'Vous êtes un assistant utile, clair et concis.',
    voiceName: 'Aoede',
  },
  activeId: null,
  conversations: [],
};

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

export function getActiveConversation() {
  return data.conversations.find((c) => c.id === data.activeId);
}

export function getCurrentMessages() {
  const active = getActiveConversation();
  return active ? active.messages : [];
}