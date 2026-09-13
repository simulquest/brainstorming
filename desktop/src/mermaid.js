// src/mermaid.js - Génération du graphique Mermaid à partir du résumé
import { elements, getActiveConversation } from './state.js';
import { setStatus } from './ui.js';
import { saveData } from './persistence.js';
import { saveTextToDevice } from './download.js';
import { getSummaryApiKey, getSummaryEndpoint, getModel } from './settings.js';

let mermaidInstance = null;
let renderSeq = 0;
const getMermaid = async () => {
  if (!mermaidInstance) {
    mermaidInstance = await import('mermaid');
    mermaidInstance.default.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      // Important : sans ça, Mermaid affiche sa propre page d'erreur
      // ("Syntax error in text", bombe) au lieu de lever une exception
      // que l'on peut gérer proprement.
      suppressErrorRendering: true,
    });
  }
  return mermaidInstance.default;
};

const nextRenderId = () => `mermaid-svg-${Date.now()}-${(renderSeq = (renderSeq + 1) % 100000)}`;

const getReportText = () => {
  const active = getActiveConversation();
  return active?.reportText || '';
};

const extractMermaidCode = (raw) => {
  const text = String(raw ?? '');
  const fenced = text.match(/```(?:mermaid)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
};

// Nettoie le code renvoyé par le LLM pour qu'il passe le parseur strict
// de Mermaid 11.17+ (c'est lui qui affichait "Syntax error in text").
// Tous les libellés de nœuds sont normalisés en ID["libellé"] avec les
// caractères cassants neutralisés. Exporté pour graph.js / graph-chat.js.
export const sanitizeMermaidCode = (raw) => {
  let code = String(raw ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim();
  if (!code) return '';

  const fence = code.match(/```(?:mermaid)?\s*([\s\S]*?)```/i);
  if (fence) code = fence[1].trim();

  // Si le modèle a ajouté du blabla autour du diagramme, on recadre
  // sur la première ligne d'en-tête reconnue.
  const firstLines = code.split('\n');
  const headerIdx = firstLines.findIndex((l) => /^(flowchart|graph|mindmap)\b/i.test(l.trim()));
  if (headerIdx > 0) {
    code = firstLines.slice(headerIdx).join('\n');
  } else if (headerIdx === -1) {
    // Aucun en-tête : ne garde que les lignes qui ressemblent à du Mermaid.
    const kept = firstLines.filter((l) =>
      /(-->|---|==>|->|\[|\(\{|^\s*[A-Za-z0-9_]+\s*[(\[]|^\s*%%)/.test(l)
    );
    if (kept.length >= 2) code = kept.join('\n');
  }

  let lines = code.split('\n').map((l) => l.replace(/\s+$/, ''));
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (!lines.length) return '';

  // Mindmap : syntaxe fragile avec le français, on se contente de
  // retirer les caractères qui cassent le parseur.
  if (/^mindmap\b/i.test(lines[0].trim())) {
    lines[0] = 'mindmap';
    return lines
      .map((l, i) => (i === 0 ? l : l.replace(/[#;<>`]/g, '').replace(/\s+$/, '')))
      .join('\n')
      .trim();
  }

  // Par défaut on normalise en flowchart (le prompt ne demande que ça).
  lines[0] = 'flowchart TD';

  const cleanLabel = (s) =>
    String(s ?? '')
      .trim()
      .replace(/^["']+|["']+$/g, '')
      .replace(/\\/g, '')
      .replace(/"/g, "'")
      .replace(/[#;`]/g, '')
      .replace(/</g, '(')
      .replace(/>/g, ')')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || ' ';

  const sanitizeEdgeLabels = (line) => line.replace(/\|([^|\n]*)\|/g, (m, l) => `|${cleanLabel(l)}|`);

  const sanitizeNodeShapes = (line) => {
    // Chaque passe re-découpe la ligne en segments cités / non cités :
    // un libellé déjà normalisé en ["..."] n'est plus jamais retouché
    // (ex : "(finale)" reste tel quel une fois entre guillemets).
    const applyShape = (text, regex) =>
      text
        .split(/("[^"\n]*")/g)
        .map((part, idx) =>
          idx % 2 === 1 ? part : part.replace(regex, (m, id, l) => `${id}["${cleanLabel(l)}"]`)
        )
        .join('');
    let out = line;
    out = applyShape(out, /([A-Za-z0-9_]+)\s*\[\s*([^\]\n]*?)\s*\]/g);
    out = applyShape(out, /([A-Za-z0-9_]+)\s*\(\(\s*([^)\n]*?)\s*\)\)/g);
    out = applyShape(out, /([A-Za-z0-9_]+)\s*\(\s*([^)\n]*?)\s*\)/g);
    out = applyShape(out, /([A-Za-z0-9_]+)\s*\{\s*([^}\n]*?)\s*\}/g);
    return out;
  };

  const sanitizeNodes = (line) => {
    if (/^\s*%%/.test(line)) return line;
    if (/^\s*(style|classDef|class|click|subgraph|end)\b/i.test(line)) return line;
    return sanitizeNodeShapes(line);
  };

  return lines.map((l, i) => (i === 0 ? l : sanitizeNodes(sanitizeEdgeLabels(l)))).join('\n').trim();
};

const shortError = (error) => {
  const msg = String(error?.message || error || 'Erreur inconnue');
  return msg.length > 300 ? `${msg.slice(0, 300)}…` : msg;
};

export const renderMermaid = async () => {
  const active = getActiveConversation();
  const rawCode = active?.mermaidCode || '';

  if (!rawCode) {
    if (elements.mermaidDiagramElement) elements.mermaidDiagramElement.innerHTML = '';
    if (elements.mermaidCodeElement) elements.mermaidCodeElement.textContent = '';
    return;
  }

  const code = sanitizeMermaidCode(rawCode);
  if (code !== rawCode && active) {
    active.mermaidCode = code;
    saveData();
  }

  if (elements.mermaidCodeElement) elements.mermaidCodeElement.textContent = code;

  try {
    const mermaid = await getMermaid();
    if (typeof mermaid.parse === 'function') {
      await mermaid.parse(code);
    }
    // ID unique à chaque rendu : Mermaid 11 refuse de réutiliser un ID
    // et la version 11.17.x est stricte sur ce point.
    const { svg } = await mermaid.render(nextRenderId(), code);
    if (elements.mermaidDiagramElement) elements.mermaidDiagramElement.innerHTML = svg;
  } catch (error) {
    console.error('Erreur de rendu Mermaid :', error);
    if (elements.mermaidDiagramElement) {
      elements.mermaidDiagramElement.innerHTML =
        `<p class="mermaid-error">Impossible de rendre le graphique (${shortError(error).replace(/</g, '&lt;')}). ` +
        'Corrigez le code en plein écran puis cliquez sur Appliquer.</p>';
    }
    throw error;
  }
};

export const refreshMermaidDisplay = async () => {
  const active = getActiveConversation();
  const hasCode = !!active?.mermaidCode;
  if (elements.mermaidContainer) elements.mermaidContainer.classList.toggle('hidden', !hasCode);
  if (hasCode) {
    try {
      await renderMermaid();
    } catch {
      // Le message d'erreur est déjà affiché dans le conteneur.
    }
  }
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
  // Prompt volontairement contraint : flowchart TD uniquement (mindmap est
  // trop fragile avec le français), IDs ASCII, libellés cités, sans
  // caractères qui cassent le parseur strict de Mermaid 11.17+.
  const systemPrompt = `Tu es un expert en diagrammes Mermaid. A partir d'un resume de projet, tu generes UNIQUEMENT un diagramme Mermaid valide de type flowchart TD qui synthetise : contexte, objectifs, perimetre, livrables, planning, risques, actions.
Regles strictes :
- Commence par exactement "flowchart TD" sur la premiere ligne.
- Reponds UNIQUEMENT avec le code Mermaid, sans commentaire, sans texte avant/apres.
- Pas de bloc de code, pas de \`\`\`mermaid.
- Noeuds : IDs simples en ASCII (A, B, C...), UN noeud par ligne, format A["Libelle court"], B["Autre libelle"].
- Maximum 10 noeuds. Libelles courts (5 mots max), en francais simple.
- INTERDIT dans les libelles : guillemets ", diese #, point-virgule ;, chevrons < >, backticks, emojis, parentheses.
- Liaisons simples uniquement avec --> (ex : A --> B).
- Exemple valide :
flowchart TD
A["Projet"] --> B["Objectifs"]
A --> C["Livrables"]
B --> D["Planning"]`;
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

    const content = result?.choices?.[0]?.message?.content || result?.choices?.[0]?.text;
    const mermaidCode = sanitizeMermaidCode(content ? extractMermaidCode(content) : '');
    if (!mermaidCode) {
      setStatus('Aucun code Mermaid reçu du modèle.', true);
      return;
    }

    const active = getActiveConversation();
    if (active) active.mermaidCode = mermaidCode;
    saveData();

    try {
      await renderMermaid();
    } catch (error) {
      await refreshMermaidDisplay();
      setStatus(`Graphique reçu mais invalide (${shortError(error)}). Corrigez-le en plein écran.`, true);
      return;
    }
    await refreshMermaidDisplay();
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
