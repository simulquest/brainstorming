// src/summary.js - Génération du résumé de conversation
import { elements, getActiveConversation, getCurrentMessages } from './state.js';
import { setStatus, updateConversationUI } from './ui.js';
import { saveData } from './persistence.js';
import { buildMarkdownTranscript } from './transcript.js';
import { getSummaryApiKey, getSummaryEndpoint, getModel } from './settings.js';

export const summarizeConversation = async () => {
  const messages = getCurrentMessages();
  if (!messages.length) {
    setStatus('Aucune conversation à résumer.', true);
    return;
  }

  const apiKey = getSummaryApiKey();
  if (!apiKey) {
    setStatus('Veuillez saisir la clé API de résumé.', true);
    return;
  }

  const endpoint = getSummaryEndpoint();
  const systemPrompt =  `Vous êtes un assistant expert en analyse et synthèse de conversations.  
Votre mission est de transformer une conversation brute en une fiche projet structurée, claire et exploitable, au format Markdown uniquement.

### Consignes strictes :
- Vous ne devez produire **que** du Markdown, sans aucun commentaire, introduction ou conclusion en dehors du format.
- La structure doit être rigoureuse et systématique (voir modèle ci-dessous).
- Vous devez extraire les informations implicites et explicites de la conversation pour synthétiser les éléments clés.
- Si des informations sont manquantes, vous devez l’indiquer clairement avec [Information non précisée].
- Le ton doit être neutre, professionnel et orienté action.

### Structure Markdown obligatoire :

# 📌 Résumé du projet

## 🧠 Contexte et origine
- Origine de la demande
- Problème ou besoin initial
- Acteurs impliqués (rôles)

## 🎯 Objectifs principaux
- Objectif global
- Objectifs spécifiques (si mentionnés)

## 📦 Périmètre et livrables
- Ce qui est inclus
- Ce qui est exclu (si évoqué)
- Livrables attendus

## 📅 Planning et étapes clés
- Dates ou durée envisagée
- Étapes ou phases identifiées
- Jalons importants

## 🔧 Ressources et contraintes
- Ressources disponibles (humaines, techniques, budgétaires)
- Contraintes identifiées (délais, techniques, réglementaires)

## 🚧 Risques et points d’attention
- Risques mentionnés ou sous-entendus
- Points de vigilance

## ✅ Prochaines actions (si évoquées)
- Tâches à réaliser
- Responsables pressentis
- Échéances

## ❓ Questions ouvertes ou à clarifier
- Éléments non résolus ou à valider
- Sujets nécessitant un arbitrage

---

  `;
  const prompt = `Conversation: \n\n${buildMarkdownTranscript()}`;
  const body = {
    model: getModel(),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
  };

  setStatus('Génération du résumé en cours...');

  // Extrait un message d'erreur lisible quelle que soit la forme renvoyée
  // par le backend : { error: { message } }, { error: "texte" },
  // { message }, { detail } ou texte brut ("user not found", ...).
  const extractApiError = (result, rawText, status) => {
    const err = result?.error;
    if (typeof err === 'string' && err.trim()) return err.trim();
    if (err && typeof err.message === 'string' && err.message.trim()) return err.message.trim();
    if (typeof result?.message === 'string' && result.message.trim()) return result.message.trim();
    if (typeof result?.detail === 'string' && result.detail.trim()) return result.detail.trim();
    if (Array.isArray(result?.detail) && result.detail.length) {
      const first = result.detail[0];
      if (typeof first === 'string') return first;
      if (first?.msg) return String(first.msg);
    }
    if (rawText && rawText.trim().length && rawText.trim().length < 500) return rawText.trim();
    return `Erreur ${status} lors de l'appel au modèle.`;
  };

  const withUserHint = (message) =>
    /user not found|utilisateur introuvable|invalid api key|incorrect api key|unauthorized|401/i.test(message || '')
      ? `${message} — Vérifiez la « Clé API Résumé » dans les Réglages (et non la clé Gemini), ainsi que l'Endpoint Résumé.`
      : message;

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
      setStatus(withUserHint(extractApiError(result, rawText, response.status)), true);
      return;
    }

    const summary = result?.choices?.[0]?.message?.content || result?.choices?.[0]?.text;
    if (!summary) {
      setStatus('Aucun résumé reçu du modèle.', true);
      return;
    }

    const active = getActiveConversation();
    if (active) {
      active.reportText = summary;
    }

    if (elements.reportTextElement) {
      elements.reportTextElement.textContent = summary;
    }
    updateConversationUI();

    saveData();
    setStatus('Résumé généré.', false);
  } catch (error) {
    console.error('Erreur génération résumé :', error);
    setStatus("Impossible de générer le résumé. Vérifiez l'endpoint et la clé API.", true);
  }
};