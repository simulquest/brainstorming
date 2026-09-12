// src/gemini.js - Connexion WebSocket bidi (Gemini Live)
import { state, getActiveConversation } from './state.js';
import { setStatus, setConnectionState, setButtonState } from './ui.js';
import { getApiKey, getSystemInstruction, getVoiceName } from './settings.js';
import { playPCMChunk } from './audio.js';
import { appendConversationEntry } from './transcript.js';

const SESSION_HANDLE_KEY = 'brainstorming-session-handle';
const HISTORY_TURNS_LIMIT = 20;

const getSavedSessionHandle = () => {
  try {
    return localStorage.getItem(SESSION_HANDLE_KEY) || '';
  } catch {
    return '';
  }
};

const saveSessionHandle = (handle) => {
  if (!handle) return;
  try {
    localStorage.setItem(SESSION_HANDLE_KEY, handle);
  } catch (e) {
    console.warn('Impossible de sauvegarder le handle de session', e);
  }
};

// Construit un rappel de contexte à partir de l'historique local.
// Le Live API est stateless : sans cela, chaque reconnexion repart de zéro.
const buildHistoryReminder = () => {
  const active = getActiveConversation();
  const messages = active ? active.messages : [];
  if (!messages.length) return '';
  const recent = messages.slice(-HISTORY_TURNS_LIMIT);
  const formatted = recent
    .map((m) => `${m.role === 'ai' ? 'Assistant' : 'Utilisateur'} : ${m.content}`)
    .join('\n');
  return (
    `\n\n[CONTEXTE — conversation précédente avec cet utilisateur, à reprendre sans redemander ce qui a déjà été dit :\n${formatted}\n]` +
    `\nContinue la conversation naturellement à partir de ce contexte.`
  );
};

// Réinjecte l'historique dans la session Live juste après le setupComplete,
// pour que le modèle "se souvienne" du fil après une coupure.
const replayHistory = () => {
  const active = getActiveConversation();
  const messages = active ? active.messages : [];
  if (!messages.length) return;
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;

  const recent = messages.slice(-HISTORY_TURNS_LIMIT);
  const turns = recent.map((m) => ({
    role: m.role === 'ai' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  try {
    state.ws.send(JSON.stringify({ clientContent: { turns, turnComplete: true } }));
  } catch (e) {
    console.warn("Impossible de réinjecter l'historique", e);
  }
};

export const connectGemini = () => {
  const apiKey = getApiKey();
  if (!apiKey) {
    setStatus('Veuillez saisir votre clé API Gemini.', true);
    return Promise.resolve(false);
  }

  setStatus('Connexion à Gemini...');
  setConnectionState(false);

  const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(apiKey)}`;
  state.ws = new WebSocket(wsUrl);
  state.ws.binaryType = 'arraybuffer';

  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    state.ws.onopen = () => {
      const voiceName = getVoiceName();
      const previousHandle = getSavedSessionHandle();
      const setup = {
        model: 'models/gemini-3.1-flash-live-preview',
        generationConfig: {
          responseModalities: ['AUDIO'],
          // Voix fixée : sans speechConfig, Gemini attribue une voix
          // différente à chaque session.
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction: {
          parts: [{ text: getSystemInstruction() + buildHistoryReminder() }],
        },
      };
      // Reprise native de session si un handle a été fourni par le serveur
      // lors d'une connexion précédente.
      if (previousHandle) {
        setup.sessionResumption = { handle: previousHandle };
      }
      state.ws?.send(JSON.stringify({ setup }));
      setStatus('Connecté à Gemini. Parlez maintenant !');
      setConnectionState(true);
      settle(true);
    };

    state.ws.onmessage = async (event) => {
      let textData = '';
      if (typeof event.data === 'string') {
        textData = event.data;
      } else if (event.data instanceof ArrayBuffer) {
        textData = new TextDecoder().decode(event.data);
      } else if (event.data instanceof Blob) {
        textData = await event.data.text();
      }

      try {
        const response = JSON.parse(textData);

        // Le serveur confirme la session : on peut réinjecter l'historique.
        if (response.setupComplete) {
          replayHistory();
          return;
        }

        // Token de reprise de session à conserver pour la prochaine connexion.
        const handle =
          response.sessionResumptionUpdate?.newHandle || response.sessionResumptionUpdate?.handle;
        if (handle) {
          saveSessionHandle(handle);
          return;
        }

        const humanText = response.serverContent?.inputTranscription?.text;
        if (humanText) {
          appendConversationEntry('human', humanText);
        }

        if (response.serverContent?.modelTurn?.parts) {
          for (const part of response.serverContent.modelTurn.parts) {
            if (part.inlineData?.data) {
              playPCMChunk(part.inlineData.data);
            }
            if (part.text) {
              appendConversationEntry('ai', part.text);
            }
          }
        }

        const aiText = response.serverContent?.outputTranscription?.text;
        if (aiText) {
          appendConversationEntry('ai', aiText);
        }

        if (response.serverContent?.turnComplete) {
          setStatus('Phrase traitée par Gemini. Continuez à parler ou arrêtez.');
        }
      } catch (error) {
        console.error('Erreur de décodage message :', error, textData);
      }
    };

    state.ws.onerror = (error) => {
      console.error('Erreur WebSocket :', error);
      setStatus('Erreur WebSocket. Vérifiez votre API key ou connexion.', true);
      setConnectionState(false);
      settle(false);
    };

    state.ws.onclose = (event) => {
      setStatus(`Déconnecté (${event.reason || 'session fermée'})`);
      setConnectionState(false);
      state.isListening = false;
      setButtonState();
    };
  });
};
