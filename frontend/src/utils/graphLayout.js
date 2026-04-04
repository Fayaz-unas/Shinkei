// Graph layout algorithms for tree visualization

export const NW          = 220;
export const NH          = 70;
export const HGAP        = 40;
export const VGAP        = 72;
export const PAD         = 56;
export const LEVEL_DELAY = 80;

// ── Build forward graph (root → children) ──────────────────────────────────
export function buildForwardLayout(nodes, edges, rootId, maxSteps = Infinity) {
  const childMap = {};
  const rootStr = String(rootId);

  nodes.forEach(n => (childMap[String(n.id)] = []));
  edges.forEach(e => {
    const fromStr = String(e.from);
    if (childMap[fromStr] !== undefined) childMap[fromStr].push(String(e.to));
  });

  // BFS forward: assign levels via forward edges
  const levels = {};
  const queue  = [rootStr];
  levels[rootStr] = 0;

  // Fallback: If rootStr isn't in nodes, pick the first node as root
  if (nodes.length > 0 && !nodes.some(n => String(n.id) === rootStr)) {
    const fallbackRoot = String(nodes[0].id);
    console.warn(`[graphLayout] rootId ${rootStr} not found. Falling back to ${fallbackRoot}`);
    queue[0] = fallbackRoot;
    levels[fallbackRoot] = 0;
  }

  while (queue.length) {
    const cur = queue.shift();
    if (levels[cur] >= maxSteps) continue;
    (childMap[cur] || []).forEach(child => {
      if (levels[child] === undefined) {
        levels[child] = levels[cur] + 1;
        queue.push(child);
      }
    });
  }

  // Second pass: some backends send reverse edges (from: child, to: parent)
  let changed = true;
  while (changed) {
    changed = false;
    edges.forEach(e => {
      const toStr = String(e.to);
      const fromStr = String(e.from);
      if (levels[toStr] !== undefined && levels[fromStr] === undefined) {
        levels[fromStr] = levels[toStr] + 1;
        changed = true;
      }
    });
  }

  const reachable     = new Set(Object.keys(levels));
  const filteredNodes = nodes.filter(n => reachable.has(String(n.id)));
  const filteredEdges = edges.filter(e => reachable.has(String(e.from)) && reachable.has(String(e.to)));

  return { ...calcLayout(filteredNodes, levels), filteredNodes, filteredEdges };
}

// ── Build backward graph ───────────────────────────────────────────────────
export function buildBackwardLayout(nodes, edges, rootId, maxSteps = Infinity) {
  const childMap = {};
  const rootStr = String(rootId);

  nodes.forEach(n => (childMap[String(n.id)] = []));
  edges.forEach(e => {
    const fromStr = String(e.from);
    if (childMap[fromStr] !== undefined) childMap[fromStr].push(String(e.to));
  });

  const levels = {};
  const queue  = [rootStr];
  levels[rootStr] = 0;

  // Fallback
  if (nodes.length > 0 && !nodes.some(n => String(n.id) === rootStr)) {
    const fallbackRoot = String(nodes[0].id);
    queue[0] = fallbackRoot;
    levels[fallbackRoot] = 0;
  }

  while (queue.length) {
    const cur = queue.shift();
    if (levels[cur] >= maxSteps) continue;
    (childMap[cur] || []).forEach(child => {
      if (levels[child] === undefined) {
        levels[child] = levels[cur] + 1;
        queue.push(child);
      }
    });
  }

  let changed = true;
  while (changed) {
    changed = false;
    edges.forEach(e => {
      const toStr = String(e.to);
      const fromStr = String(e.from);
      if (levels[toStr] !== undefined && levels[fromStr] === undefined) {
        levels[fromStr] = levels[toStr] + 1;
        changed = true;
      }
    });
  }

  const reachable     = new Set(Object.keys(levels));
  const filteredNodes = nodes.filter(n => reachable.has(String(n.id)));
  const filteredEdges = edges.filter(e => reachable.has(String(e.from)) && reachable.has(String(e.to)));

  const maxSoFar = Math.max(0, ...Object.values(levels));
  filteredNodes.forEach(n => {
    const nid = String(n.id);
    if (levels[nid] === undefined) levels[nid] = maxSoFar + 1;
  });

  return { ...calcLayout(filteredNodes, levels, true), filteredNodes, filteredEdges };
}

function calcLayout(nodes, levels, flipY = false) {
  const byDepth = {};
  Object.entries(levels).forEach(([id, d]) => {
    if (!byDepth[d]) byDepth[d] = [];
    byDepth[d].push(id);
  });

  const depthKeys = Object.keys(byDepth).map(Number);
  if (depthKeys.length === 0) return { pos: {}, levels: {}, svgW: 0, svgH: 0 };

  const maxDepth = Math.max(...depthKeys);
  const maxRowW  = Math.max(
    ...Object.values(byDepth).map(row => row.length * NW + (row.length - 1) * HGAP)
  );

  const totalH = (maxDepth + 1) * (NH + VGAP) - VGAP;

  const pos = {};
  for (let d = 0; d <= maxDepth; d++) {
    const row    = byDepth[d] || [];
    const rowW   = row.length * NW + (row.length - 1) * HGAP;
    const offset = (maxRowW - rowW) / 2;
    const yRow   = flipY ? totalH - d * (NH + VGAP) - NH : d * (NH + VGAP);
    row.forEach((id, i) => {
      pos[id] = { x: offset + i * (NW + HGAP), y: yRow };
    });
  }

  const svgW = Math.max(800, maxRowW + PAD * 2);
  const svgH = totalH + PAD * 2 + 20;
  return { pos, levels, svgW, svgH };
}