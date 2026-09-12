// src/settings.js - Lecture des champs de configuration
import { elements } from './state.js';

export const VOICE_OPTIONS = [
  { value: 'Puck', label: 'Puck — Dynamique' },
  { value: 'Charon', label: 'Charon — Grave' },
  { value: 'Kore', label: 'Kore — Douce' },
  { value: 'Fenrir', label: 'Fenrir — Énergique' },
  { value: 'Aoede', label: 'Aoede — Claire' },
  { value: 'Leda', label: 'Leda — Calme' },
  { value: 'Orus', label: 'Orus — Posée' },
];

export const DEFAULT_VOICE = 'Aoede';

export const getApiKey = () => elements.apiKeyInput?.value.trim();

export const getSummaryApiKey = () => elements.resumeApiKeyInput?.value.trim();

export const getModel = () => elements.modelInput?.value.trim() || 'openai-fast';

export const getSummaryEndpoint = () =>
  elements.endPointInput?.value.trim() || 'https://api.openai.com/v1/chat/completions';

export const getSystemInstruction = () =>
  elements.systemInstructionText?.value.trim() ||
  'Vous êtes un assistant utile, clair et concis.';

export const getVoiceName = () => {
  const v = elements.voiceSelect?.value.trim() || '';
  return v || DEFAULT_VOICE;
};