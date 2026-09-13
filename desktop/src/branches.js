// src/branches.js - Détection et filtrage des branches d'un graphique Mermaid.
// Supporte `flowchart` (branches = enfants directs de la racine, avec leur
// sous-arbre) et `mindmap` (branches = nœuds de niveau 1 avec leur sous-arbre).
// Les branches masquées servent uniquement à l'affichage : le code source
// sauvegardé n'est jamais modifié.

const ID_RE = '[A-Za-z0-9_]+';
const ARROW_RE = /--+>|---|==>|-\.-+->|-\.+->|~~~|-->|---/;

const firstId = (text) => {
  const m = String(text || '').match(new RegExp(ID_RE));
  return m ? m[0] : '';
};

// Libellé d'un nœud flowchart : A["label"], A[label], A((label)), A{label}…
const flowchartLabel = (code, id) => {
  const m = code.match(new RegExp(`${id}\\s*[\\(\\[\\{]+([^\\n\\)\\]\\}]+)`));
  return (m ? m[1] : id).trim().replace(/^["']|["']$/g, '') || id;
};

// ----------------------------- flowchart -----------------------------
const parseFlowchart = (lines) => {
  const children = new Map(); // parent -> [child]
  const hasParent = new Set();
  const seenSources = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%')) return;
    if (!ARROW_RE.test(line)) return;
    // Une ligne peut chaîner plusieurs flèches : A --> B --> C
    const segments = line.split(ARROW_RE);
    const ids = segments.map((seg) => firstId(seg)).filter(Boolean);
    for (let i = 0; i < ids.length - 1; i++) {
      const parent = ids[i];
      const child = ids[i + 1];
      if (!children.has(parent)) children.set(parent, []);
      if (!children.get(parent).includes(child)) children.get(parent).push(child);
      hasParent.add(child);
      if (!seenSources.includes(parent)) seenSources.push(parent);
    }
  });

  if (!seenSources.length) return { type: 'flowchart', branches: [] };
  const root = seenSources.find((s) => !hasParent.has(s)) || seenSources[0];
  const code = lines.join('\n');

  const branchIds = children.get(root) || [];
  const branches = branchIds.map((id) => ({ id, label: flowchartLabel(code, id) }));
  return { type: 'flowchart', root, children, branches };
};

const descendants = (children, id) => {
  const out = new Set([id]);
  const stack = [id];
  while (stack.length) {
    const current = stack.pop();
    for (const child of children.get(current) || []) {
      if (!out.has(child)) {
        out.add(child);
        stack.push(child);
      }
    }
  }
  return out;
};

const filterFlowchart = (lines, parsed, hiddenIds) => {
  if (!hiddenIds.size) return lines.join('\n');
  const masked = new Set();
  hiddenIds.forEach((id) => descendants(parsed.children, id).forEach((d) => masked.add(d)));

  return lines
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('%%')) return true;
      if (!ARROW_RE.test(line)) {
        // Définition isolée : `C["label"]` → on la retire si le nœud est masqué.
        const m = trimmed.match(new RegExp(`^(${ID_RE})\\s*[\\(\\[]`));
        if (m && masked.has(m[1])) return false;
        return true;
      }
      const segments = line.split(ARROW_RE);
      const ids = segments.map((seg) => firstId(seg)).filter(Boolean);
      if (!ids.length) return true;
      // On retire toute la ligne dès qu'un nœud masqué est impliqué,
      // sinon Mermaid ré-afficherait le nœud via l'arête restante.
      return ids.every((id) => !masked.has(id));
    })
    .join('\n');
};

// ------------------------------ mindmap ------------------------------
const mindmapIndent = (line) => (line.match(/^(\s*)/) || ['', ''])[1].length;

const cleanMindmapLabel = (text) =>
  text.trim().replace(/^[\(\[\{]+|[\)\]\}]+$/g, '').trim() || text.trim();

const parseMindmap = (lines) => {
  const body = lines.filter((l) => l.trim() && l.trim().toLowerCase() !== 'mindmap');
  if (!body.length) return { type: 'mindmap', branches: [] };
  const rootIndent = Math.min(...body.map(mindmapIndent));
  const rootIdx = body.findIndex((l) => mindmapIndent(l) === rootIndent);
  const afterRoot = body.slice(rootIdx + 1);
  const unit = afterRoot.length ? Math.min(...afterRoot.map(mindmapIndent)) - rootIndent : 2;
  const branchIndent = rootIndent + (unit > 0 ? unit : 2);

  const branches = [];
  afterRoot.forEach((line, i) => {
    if (mindmapIndent(line) === branchIndent) {
      branches.push({ id: `branch-${branches.length}`, label: cleanMindmapLabel(line), index: i });
    }
  });
  return { type: 'mindmap', branches, body, afterRoot, branchIndent, rootIdx };
};

const filterMindmap = (lines, parsed, hiddenIds) => {
  if (!hiddenIds.size) return lines.join('\n');
  const hiddenIdx = new Set(
    parsed.branches.filter((b) => hiddenIds.has(b.id)).map((b) => b.index)
  );
  const kept = [];
  let skipping = false;
  parsed.afterRoot.forEach((line, i) => {
    const indent = mindmapIndent(line);
    if (indent === parsed.branchIndent) {
      skipping = hiddenIdx.has(i);
      if (!skipping) kept.push(line);
      return;
    }
    if (!skipping) kept.push(line);
  });
  const head = lines.slice(0, lines.indexOf(parsed.body[0]));
  const tail = lines.slice(lines.indexOf(parsed.body[parsed.body.length - 1]) + 1);
  // La racine (body[rootIdx]) est toujours conservée, seules les branches
  // masquées et leur sous-arbre sont retirés.
  return [...head, parsed.body[parsed.rootIdx], ...kept].concat(tail).join('\n');
};

// ------------------------------ API ----------------------------------
export const parseBranches = (code) => {
  const lines = String(code || '').split('\n');
  if (!lines.length) return { type: 'unknown', branches: [] };
  const header = (lines[0] || '').trim().toLowerCase();
  if (header.startsWith('mindmap')) return parseMindmap(lines);
  if (header.startsWith('flowchart') || header.startsWith('graph')) return parseFlowchart(lines);
  // Sans en-tête reconnu : tentative flowchart.
  return parseFlowchart(lines);
};

export const filterBranches = (code, hiddenIds) => {
  const parsed = parseBranches(code);
  const lines = String(code || '').split('\n');
  if (parsed.type === 'mindmap') return filterMindmap(lines, parsed, hiddenIds);
  if (parsed.type === 'flowchart') return filterFlowchart(lines, parsed, hiddenIds);
  return code;
};
