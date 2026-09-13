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

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();
    if (!response.ok) {
      const errorMessage = result.error?.message || "Erreur lors de l'appel au modèle.";
      setStatus(errorMessage, true);
      return;
    }

    const summary = result.choices?.[0]?.message?.content || result.choices?.[0]?.text;
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