// src/mermaid.js - Génération du graphique Mermaid à partir du résumé
import { elements, getActiveConversation } from './state.js';
import { setStatus } from './ui.js';
import { saveData } from './persistence.js';
import { saveTextToDevice } from './download.js';
import { getSummaryApiKey, getSummaryEndpoint, getModel } from './settings.js';

let mermaidInstance = null;
const getMermaid = async () => {
  if (!mermaidInstance) {
    mermaidInstance = await import('mermaid');
    mermaidInstance.default.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
  }
  return mermaidInstance.default;
};

const getReportText = () => {
  const active = getActiveConversation();
  return active?.reportText || '';
};

const extractMermaidCode = (raw) => {
  const match = raw.match(/```mermaid\s*([\s\S]*?)```/i);
  return (match ? match[1] : raw).trim();
};

export const renderMermaid = async () => {
  const active = getActiveConversation();
  const code = active?.mermaidCode || '';

  if (!code) {
    if (elements.mermaidDiagramElement) elements.mermaidDiagramElement.innerHTML = '';
    if (elements.mermaidCodeElement) elements.mermaidCodeElement.textContent = '';
    return;
  }

  if (elements.mermaidCodeElement) elements.mermaidCodeElement.textContent = code;

  try {
    const mermaid = await getMermaid();
    const { svg } = await mermaid.render('mermaid-diagram-svg', code);
    if (elements.mermaidDiagramElement) elements.mermaidDiagramElement.innerHTML = svg;
  } catch (error) {
    console.error('Erreur de rendu Mermaid :', error);
    if (elements.mermaidDiagramElement) {
      elements.mermaidDiagramElement.innerHTML =
        '<p class="mermaid-error">Impossible de rendre le graphique. Vérifiez le code ci-dessous.</p>';
    }
  }
};

export const refreshMermaidDisplay = async () => {
  const active = getActiveConversation();
  const hasCode = !!active?.mermaidCode;
  if (elements.mermaidContainer) elements.mermaidContainer.classList.toggle('hidden', !hasCode);
  await renderMermaid();
};

export const generateMermaidGraph = async () => {
  const reportText = getReportText();
  if (!reportText) {
    setStatus("Générez d'abord le résumé avant de créer le graphique.", true);
    return;
  }

  const apiKey = getSummaryApiKey();
  if (!apiKey) {
    setStatus('Veuillez saisir la clé API de résumé.', true);
    return;
  }

  setStatus('Génération du graphique Mermaid en cours...');

  const endpoint = getSummaryEndpoint();
  const systemPrompt = `Tu es un expert en création de diagrammes Mermaid. À partir d'un résumé de projet, tu génères UNIQUEMENT un diagramme Mermaid valide (type flowchart TD ou mindmap) qui synthétise visuellement la structure du projet : contexte, objectifs, périmètre, livrables, planning, risques, actions.
Règles :
- Réponds UNIQUEMENT avec le code Mermaid, sans commentaire, sans texte avant/après.
- Pas de fenced code block, pas de \`\`\`mermaid.
- Utilise des libellés courts et clairs.
- Valide la syntaxe Mermaid (pas de caractères spéciaux problématiques dans les libellés).`;
  const body = {
    model: getModel(),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Voici le résumé du projet :\n\n${reportText}` },
    ],
    temperature: 0.2,
  };

  try {
    const response = await fetch(endpoint.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify(body),
    });

    // Lecture en texte d'abord : certains backends renvoient une erreur
    // en texte brut ("user not found"), ce qui faisait échouer response.json().
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
      setStatus(
        /user not found|utilisateur introuvable|invalid api key|incorrect api key|unauthorized|401/i.test(String(errorMessage))
          ? `${errorMessage} — Vérifiez la « Clé API Résumé » dans les Réglages (et non la clé Gemini), ainsi que l'Endpoint Résumé.`
          : errorMessage,
        true
      );
      return;
    }

    const content = result.choices?.[0]?.message?.content || result.choices?.[0]?.text;
    const mermaidCode = content ? extractMermaidCode(content) : '';
    if (!mermaidCode) {
      setStatus('Aucun code Mermaid reçu du modèle.', true);
      return;
    }

    const active = getActiveConversation();
    if (active) active.mermaidCode = mermaidCode;
    saveData();

    await renderMermaid();
    setStatus('Graphique Mermaid généré.', false);
  } catch (error) {
    console.error('Erreur génération Mermaid :', error);
    setStatus("Impossible de générer le graphique. Vérifiez l'endpoint et la clé API.", true);
  }
};

export const downloadGraph = () => {
  const active = getActiveConversation();
  const content = active?.mermaidCode || '';
  if (!content) {
    setStatus('Aucun graphique à télécharger.', true);
    return;
  }
  return saveTextToDevice(
    `graphique-${getActiveConversation().id || 'export'}.mmd`,
    content,
    'text/plain',
    'Partager le graphique Mermaid'
  );
};