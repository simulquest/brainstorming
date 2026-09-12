// src/download.js - Sauvegarde / partage de fichiers (Markdown, Mermaid…)
// - App native Capacitor (APK) : écriture via le plugin natif Filesystem
//   (copie persistante dans Documents) + feuille de partage native via Share.
// - Navigateur (dev) : téléchargement classique via <a download>.
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { data } from './state.js';
import { setStatus } from './ui.js';
import { buildMarkdownTranscript } from './transcript.js';

const sanitizeFileName = (name) =>
  String(name || 'export.txt')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim() || 'export.txt';

const isNative = () => {
  try {
    return !!window.Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
};

const isShareCancelled = (error) => /cancel|dismiss/i.test(String(error?.message || error || ''));

export const saveTextToDevice = async (fileName, content, mimeType, dialogTitle) => {
  const safeName = sanitizeFileName(fileName);
  const text = content ?? '';

  // ---------- App native : plugins Capacitor ----------
  if (isNative()) {
    // 1. Copie persistante (retrouvable dans les Documents de l'app)
    try {
      await Filesystem.writeFile({
        path: safeName,
        data: text,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        recursive: true,
      });
    } catch (error) {
      console.warn('Écriture Documents impossible :', error);
    }

    // 2. Feuille de partage native (fichier temporaire dans le Cache)
    try {
      await Filesystem.writeFile({
        path: safeName,
        data: text,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      const { uri } = await Filesystem.getUri({ path: safeName, directory: Directory.Cache });

      try {
        await Share.share({
          title: dialogTitle || safeName,
          dialogTitle: dialogTitle || 'Partager le fichier',
          files: [uri],
        });
      } catch (shareError) {
        // Annulation par l'utilisateur : le fichier reste dispo dans Documents.
        if (isShareCancelled(shareError)) {
          setStatus('Fichier enregistré dans Documents.', false);
          return true;
        }
        throw shareError;
      }

      setStatus('Fichier enregistré et partage ouvert.', false);
      return true;
    } catch (error) {
      console.error('Erreur export natif :', error);
      setStatus("Partage impossible, mais le fichier est dans Documents (si l'écriture a réussi).", true);
      return false;
    }
  }

  // ---------- Navigateur : téléchargement classique ----------
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
