// src/download.js - Sauvegarde de fichiers, version desktop (Tauri).
// - Sous Tauri : dialogue "Enregistrer sous…" natif + écriture via plugin-fs.
// - Hors Tauri (navigateur / dev web) : téléchargement classique via <a download>.
import { data } from './state.js';
import { setStatus } from './ui.js';
import { buildMarkdownTranscript } from './transcript.js';

const sanitizeFileName = (name) =>
  String(name || 'export.txt')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim() || 'export.txt';

const isTauri = () => {
  try {
    return !!window.__TAURI_INTERNALS__ || !!window.__TAURI__;
  } catch {
    return false;
  }
};

const saveWithTauri = async (fileName, content) => {
  const { save } = await import('@tauri-apps/plugin-dialog');
  const { writeTextFile } = await import('@tauri-apps/plugin-fs');

  const dot = fileName.lastIndexOf('.');
  const filters = dot > 0 ? [{ name: 'Fichiers', extensions: [fileName.slice(dot + 1)] }] : undefined;
  const path = await save({ defaultPath: fileName, filters });
  if (!path) return false; // Dialogue annulé par l'utilisateur.
  await writeTextFile(path, content ?? '');
  return true;
};

const saveWithBrowser = (fileName, content, mimeType) => {
  const blob = new Blob([content ?? ''], { type: mimeType || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const saveTextToDevice = async (fileName, content, mimeType, dialogTitle) => {
  const safeName = sanitizeFileName(fileName);

  if (isTauri()) {
    try {
      const saved = await saveWithTauri(safeName, content);
      setStatus(saved ? 'Fichier enregistré.' : 'Enregistrement annulé.', !saved);
      return saved;
    } catch (error) {
      console.error('Erreur enregistrement Tauri :', error);
      setStatus("Impossible d'enregistrer le fichier.", true);
      return false;
    }
  }

  try {
    saveWithBrowser(safeName, content, mimeType);
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
    'text/markdown',
    'Partager la conversation'
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
    'text/markdown',
    'Partager le résumé'
  );
};
