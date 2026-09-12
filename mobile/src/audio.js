// src/audio.js - Microphone (STT) et lecture audio (TTS)
import { elements, state } from './state.js';
import { setStatus } from './ui.js';

export const updateAudioLevel = (value) => {
  if (!elements.audioLevel) return;
  const width = Math.min(100, Math.max(4, Math.round(value * 160)));
  elements.audioLevel.style.width = `${width}%`;
};

export const startMicrophone = async () => {
  try {
    state.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.recordAudioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const source = state.recordAudioCtx.createMediaStreamSource(state.mediaStream);
    state.scriptProcessor = state.recordAudioCtx.createScriptProcessor(2048, 1, 1);

    source.connect(state.scriptProcessor);
    state.scriptProcessor.connect(state.recordAudioCtx.destination);

    state.scriptProcessor.onaudioprocess = (event) => {
      if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;

      const inputData = event.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
      const rms = Math.sqrt(sum / inputData.length);
      updateAudioLevel(rms);

      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const sample = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }

      const bytes = new Uint8Array(pcm16.buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);

      state.ws.send(
        JSON.stringify({
          realtimeInput: {
            audio: {
              mimeType: 'audio/pcm;rate=16000',
              data: btoa(binary),
            },
          },
        })
      );
    };
  } catch (error) {
    console.error("Impossible d'accéder au micro :", error);
    setStatus("Impossible d'accéder au microphone.", true);
    updateAudioLevel(0);
  }
};

export const stopMicrophone = () => {
  if (state.scriptProcessor) {
    state.scriptProcessor.disconnect();
    state.scriptProcessor = null;
  }
  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach((track) => track.stop());
    state.mediaStream = null;
  }
  if (state.recordAudioCtx) {
    state.recordAudioCtx.close();
    state.recordAudioCtx = null;
  }
  state.isListening = false;
  updateAudioLevel(0);
};

export const initAudioPlayback = () => {
  if (state.playAudioCtx && state.playAudioCtx.state !== 'closed') return;
  state.playAudioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
  state.nextPlayTime = state.playAudioCtx.currentTime;
};

export const playPCMChunk = (base64PCM) => {
  if (!state.playAudioCtx) return;
  const binary = atob(base64PCM);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const int16Array = new Int16Array(bytes.buffer);
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) float32Array[i] = int16Array[i] / 32768;

  const buffer = state.playAudioCtx.createBuffer(1, float32Array.length, 24000);
  buffer.getChannelData(0).set(float32Array);
  const source = state.playAudioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(state.playAudioCtx.destination);

  const currentTime = state.playAudioCtx.currentTime;
  if (state.nextPlayTime < currentTime) state.nextPlayTime = currentTime;
  source.start(state.nextPlayTime);
  state.nextPlayTime += buffer.duration;
};