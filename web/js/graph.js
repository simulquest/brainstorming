// js/graph.js - Éditeur graphique plein écran (zoom/pan + édition + branches).
// Version web : mermaid via CDN (window.mermaid).
import { elements, getActiveConversation } from './state.js';
import { setStatus } from './ui.js';
import { saveData } from './persistence.js';
import { renderMermaid } from './mermaid.js';
import { parseBranches, filterBranches } from './branches.js';

// Branches masquées (affichage uniquement : le code sauvegardé reste intact)
let hiddenBranchIds = new Set();

let mermaidReady = false;
export const getMermaid = () => {
  const m = window.mermaid;
  if (!m) {
    throw new Error('Mermaid CDN non chargé.');
  }
  if (!mermaidReady) {
    m.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
    mermaidReady = true;
  }
  return m;
};

let zoom = 1;
let panX = 0;
let panY = 0;
let dragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragBaseX = 0;
let dragBaseY = 0;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const applyTransform = () => {
  if (!elements.graphRender) return;
  elements.graphRender.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  if (elements.graphZoomLevel) elements.graphZoomLevel.textContent = `${Math.round(zoom * 100)}%`;
};

const setZoomAt = (factor, cx, cy) => {
  const rect = elements.graphCanvas?.getBoundingClientRect();
  const centerX = cx !== undefined ? cx - (rect?.left || 0) - panX : (rect?.width || 0) / 2 / zoom;
  const centerY = cy !== undefined ? cy - (rect?.top || 0) - panY : (rect?.height || 0) / 2 / zoom;
  const newZoom = clamp(zoom * factor, 0.2, 4);
  panX = (cx !== undefined ? cx - (rect?.left || 0) : (rect?.width || 0) / 2) - centerX * newZoom;
  panY = (cy !== undefined ? cy - (rect?.top || 0) : (rect?.height || 0) / 2) - centerY * newZoom;
  zoom = newZoom;
  applyTransform();
};

export const renderCanvas = async (code) => {
  if (!elements.graphRender) return;
  elements.graphRender.innerHTML = '';
  if (!code) return;
  const visibleCode = filterBranches(code, hiddenBranchIds);
  if (!visibleCode.trim()) {
    elements.graphRender.innerHTML = '<p class="mermaid-error">Toutes les branches sont masquées. Réactivez-en au moins une.</p>';
    applyTransform();
    return;
  }
  try {
    const mermaid = getMermaid();
    const { svg } = await mermaid.render(`graph-full-${Date.now()}`, visibleCode);
    elements.graphRender.innerHTML = svg;
  } catch (error) {
    console.error('Erreur de rendu plein écran :', error);
    elements.graphRender.innerHTML = '<p class="mermaid-error">Code Mermaid invalide. Corrigez-le puis cliquez sur Appliquer.</p>';
  }
  applyTransform();
};

// --------------------- Branches on/off ---------------------
export const renderBranchChips = () => {
  const list = elements.graphBranchesList;
  if (!list) return;
  list.innerHTML = '';

  const code = elements.graphCodeEditor?.value?.trim() || '';
  const { branches } = parseBranches(code);

  if (elements.graphBranches) {
    elements.graphBranches.classList.toggle('hidden', branches.length === 0);
  }
  if (!branches.length) return;

  branches.forEach((branch) => {
    const chip = document.createElement('button');
    const visible = !hiddenBranchIds.has(branch.id);
    chip.type = 'button';
    chip.className = `branch-chip${visible ? ' active' : ''}`;
    chip.textContent = branch.label;
    chip.title = visible ? 'Masquer cette branche' : 'Afficher cette branche';
    chip.addEventListener('click', () => {
      if (hiddenBranchIds.has(branch.id)) {
        hiddenBranchIds.delete(branch.id);
      } else {
        hiddenBranchIds.add(branch.id);
      }
      renderBranchChips();
      renderCanvas(elements.graphCodeEditor?.value?.trim() || '');
    });
    list.appendChild(chip);
  });
};

const showAllBranches = () => {
  hiddenBranchIds.clear();
  renderBranchChips();
  renderCanvas(elements.graphCodeEditor?.value?.trim() || '');
};

const hideAllBranches = () => {
  const code = elements.graphCodeEditor?.value?.trim() || '';
  hiddenBranchIds = new Set(parseBranches(code).branches.map((b) => b.id));
  renderBranchChips();
  renderCanvas(code);
};

export const openFullscreen = async () => {
  const active = getActiveConversation();
  const code = active?.mermaidCode || '';
  if (!code) {
    setStatus("Générez d'abord le graphique.", true);
    return;
  }
  if (elements.graphCodeEditor) elements.graphCodeEditor.value = code;
  if (elements.graphOverlay) elements.graphOverlay.classList.remove('hidden');
  zoom = 1;
  panX = 0;
  panY = 0;
  hiddenBranchIds = new Set();
  renderBranchChips();
  await renderCanvas(code);
  applyTransform();
};

export const closeFullscreen = () => {
  if (elements.graphOverlay) elements.graphOverlay.classList.add('hidden');
  renderMermaid();
};

export const applyGraphCode = async () => {
  const code = elements.graphCodeEditor?.value?.trim() || '';
  if (!code) {
    setStatus('Le code Mermaid est vide.', true);
    return;
  }
  const active = getActiveConversation();
  if (active) active.mermaidCode = code;
  saveData();
  // Ne garde que les branches qui existent encore dans le nouveau code.
  const known = new Set(parseBranches(code).branches.map((b) => b.id));
  hiddenBranchIds = new Set([...hiddenBranchIds].filter((id) => known.has(id)));
  renderBranchChips();
  await renderCanvas(code);
  renderMermaid();
  setStatus('Graphique mis à jour.', false);
};

// --------------------- Événements ---------------------
elements.graphClose?.addEventListener('click', closeFullscreen);

elements.graphZoomIn?.addEventListener('click', () => setZoomAt(1.25));
elements.graphZoomOut?.addEventListener('click', () => setZoomAt(0.8));
elements.graphZoomReset?.addEventListener('click', () => {
  zoom = 1;
  panX = 0;
  panY = 0;
  applyTransform();
});

elements.graphCanvas?.addEventListener('wheel', (e) => {
  e.preventDefault();
  setZoomAt(e.deltaY < 0 ? 1.12 : 0.89, e.clientX, e.clientY);
}, { passive: false });

elements.graphCanvas?.addEventListener('pointerdown', (e) => {
  dragging = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragBaseX = panX;
  dragBaseY = panY;
  elements.graphCanvas.setPointerCapture(e.pointerId);
});

elements.graphCanvas?.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  panX = dragBaseX + (e.clientX - dragStartX);
  panY = dragBaseY + (e.clientY - dragStartY);
  applyTransform();
});

elements.graphCanvas?.addEventListener('pointerup', (e) => {
  dragging = false;
  try { elements.graphCanvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
});
elements.graphCanvas?.addEventListener('pointercancel', () => { dragging = false; });

elements.graphApply?.addEventListener('click', () => applyGraphCode());
elements.graphBranchesAll?.addEventListener('click', showAllBranches);
elements.graphBranchesNone?.addEventListener('click', hideAllBranches);
