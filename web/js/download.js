// js/download.js - Version web pure (sans Capacitor, sans Node).
// Téléchargement classique via Blob + <a download>.
import { data } from './state.js';
import { setStatus } from './ui.js';
import { buildMarkdownTranscript } from './transcript.js';

const sanitizeFileName = (name) =>
  String(name || 'export.txt')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim() || 'export.txt';

export const saveTextToDevice = async (fileName, content, mimeType) => {
  const safeName = sanitizeFileName(fileName);
  const text = content ?? '';

  try {
    const blob = new Blob([text], { type: mimeType || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('Fichier téléchargé.', false);
    return true;
  } catch (error) {
    console.error('Erreur téléchargement :', error);
    setStatus('Impossible de télécharger le fichier.', true);
    return false;
  }
};

export const downloadTranscript = () =>
  saveTextToDevice(
    `conversation-${data.activeId || 'export'}.md`,
    buildMarkdownTranscript(),
    'text/markdown'
  );

export const downloadSummary = () => {
  const active = data.conversations.find((c) => c.id === data.activeId);
  const content = active?.reportText || '';
  if (!content) {
    setStatus('Aucun résumé à télécharger.', true);
    return;
  }
  return saveTextToDevice(
    `resume-${data.activeId || 'export'}.md`,
    content,
    'text/markdown'
  );
};
