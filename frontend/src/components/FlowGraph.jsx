import { useEffect, useState, useCallback } from 'react';
import CodePanel from './CodePanel';

const TYPE = {
  event:    { label: 'Event',    accent: '#EF9F27', bg: 'rgba(239,159,39,0.12)',  border: 'rgba(239,159,39,0.45)',  text: '#FDD68A' },
  function: { label: 'Function', accent: '#7F77DD', bg: 'rgba(127,119,221,0.12)', border: 'rgba(127,119,221,0.45)', text: '#DEDCF9' },
  api:      { label: 'API',      accent: '#1D9E75', bg: 'rgba(29,158,117,0.12)',  border: 'rgba(29,158,117,0.45)',  text: '#B5ECDA' },
  response: { label: 'Response', accent: '#378ADD', bg: 'rgba(55,138,221,0.12)',  border: 'rgba(55,138,221,0.45)',  text: '#C8DFF7' },
};

const NW         = 200;
const NH         = 64;
const HGAP       = 36;
const VGAP       = 68;
const PAD        = 48;
const LEVEL_DELAY = 650;

// ── Build forward graph (root → children) ──────────────────────────────────
function buildForwardLayout(nodes, edges, rootId) {
  const childMap = {};
  nodes.forEach(n => (childMap[n.id] = []));
  edges.forEach(e => {
    if (childMap[e.from] !== undefined) childMap[e.from].push(e.to);
  });

  const levels = {};
  const queue  = [rootId];
  levels[rootId] = 0;
  while (queue.length) {
    const cur = queue.shift();
    (childMap[cur] || []).forEach(child => {
      if (levels[child] === undefined) {
        levels[child] = levels[cur] + 1;
        queue.push(child);
      }
    });
  }
  return calcLayout(nodes, levels);
}

// ── Build backward graph ──────────────────────────────────────────────────
// Root sits at BOTTOM. Functions it calls grow UPWARD.
// Same BFS as forward but Y positions are flipped.
function buildBackwardLayout(nodes, edges, rootId) {
  const childMap = {};
  nodes.forEach(n => (childMap[n.id] = []));
  edges.forEach(e => {
    if (childMap[e.from] !== undefined) childMap[e.from].push(e.to);
  });

  const levels = {};
  const queue  = [rootId];
  levels[rootId] = 0;
  while (queue.length) {
    const cur = queue.shift();
    (childMap[cur] || []).forEach(child => {
      if (levels[child] === undefined) {
        levels[child] = levels[cur] + 1;
        queue.push(child);
      }
    });
  }
  const maxSoFar = Math.max(0, ...Object.values(levels));
  nodes.forEach(n => {
    if (levels[n.id] === undefined) levels[n.id] = maxSoFar + 1;
  });
  return calcLayout(nodes, levels, true);
}

function calcLayout(nodes, levels, flipY = false) {
  const byDepth = {};
  Object.entries(levels).forEach(([id, d]) => {
    if (!byDepth[d]) byDepth[d] = [];
    byDepth[d].push(Number(id));
  });

  const maxDepth = Math.max(...Object.keys(byDepth).map(Number));
  const maxRowW  = Math.max(
    ...Object.values(byDepth).map(row => row.length * NW + (row.length - 1) * HGAP)
  );

  const totalH = (maxDepth + 1) * (NH + VGAP) - VGAP;

  const pos = {};
  for (let d = 0; d <= maxDepth; d++) {
    const row    = byDepth[d] || [];
    const rowW   = row.length * NW + (row.length - 1) * HGAP;
    const offset = (maxRowW - rowW) / 2;
    // flipY: level 0 (root) at bottom, deeper levels go up
    const yRow   = flipY ? totalH - d * (NH + VGAP) - NH : d * (NH + VGAP);
    row.forEach((id, i) => {
      pos[id] = { x: offset + i * (NW + HGAP), y: yRow };
    });
  }

  const svgW = maxRowW + PAD * 2;
  const svgH = totalH + PAD * 2 + 20;
  return { pos, levels, svgW, svgH };
}

// ── Edge ───────────────────────────────────────────────────────────────────
function EdgePath({ from, to, label, pos, levels, visible, backward }) {
  const fp = pos[from], tp = pos[to];
  if (!fp || !tp) return null;

  // In backward mode swap visual direction so arrows flow top→down
  // forward: parent-bottom → child-top
  // backward: positions are flipped so child is above parent;
  //           draw from child-bottom (visually upper node) → parent-top (visually lower node)
  const [sx, sy_start, ex, ey_start] = backward
    ? [PAD + tp.x + NW / 2, PAD + tp.y + NH,  PAD + fp.x + NW / 2, PAD + fp.y]
    : [PAD + fp.x + NW / 2, PAD + fp.y + NH,  PAD + tp.x + NW / 2, PAD + tp.y];

  const my = (sy_start + ey_start) / 2;

  const sameLevel = levels[from] === levels[to];
  let d;
  if (sameLevel) {
    const bend = 55;
    d = `M ${sx} ${sy_start - NH / 2} C ${sx} ${sy_start + bend}, ${ex} ${ey_start - bend}, ${ex} ${ey_start - NH / 2}`;
  } else if (Math.abs(sx - ex) < 2) {
    d = `M ${sx} ${sy_start} L ${ex} ${ey_start}`;
  } else {
    d = `M ${sx} ${sy_start} C ${sx} ${my}, ${ex} ${my}, ${ex} ${ey_start}`;
  }

  // Animate based on destination level in current direction
  const destLevel = backward ? levels[from] : levels[to];

  return (
    <g style={{
      opacity: visible ? 1 : 0,
      transition: `opacity 0.6s ease ${destLevel * LEVEL_DELAY + 150}ms`,
    }}>
      <path d={d} fill="none" stroke="#6366f1" strokeWidth="1.8" opacity="0.9" markerEnd="url(#arr)" />
      {label && (
        <text
          x={(sx + ex) / 2}
          y={my - 6}
          textAnchor="middle" fontSize="11"
          fontFamily="monospace" fill="#a5b4fc" letterSpacing="0.04em" fontWeight="500"
        >
          {label}
        </text>
      )}
    </g>
  );
}

// ── Node ───────────────────────────────────────────────────────────────────
function NodeCard({ node, pos, isRoot, isActive, onClick, level, visible }) {
  const p = pos[node.id];
  if (!p) return null;

  const x = PAD + p.x;
  const y = PAD + p.y;
  const t = TYPE[node.type] || TYPE.function;
  const shortLabel = node.label.length > 22 ? node.label.slice(0, 21) + '...' : node.label;
  const shortFile  = node.file.length  > 24 ? '...' + node.file.slice(-23)   : node.file;
  const delay      = level * LEVEL_DELAY;

  return (
    <g
      style={{
        cursor: 'pointer',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0px)' : 'translateY(18px)',
        transition: `opacity 0.7s ease ${delay}ms, transform 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
      }}
      onClick={() => onClick(node.id)}
    >
      {isRoot && (
        <rect x={x - 5} y={y - 5} width={NW + 10} height={NH + 10} rx={14}
          fill={t.accent} opacity={0.13} />
      )}
      {isActive && (
        <rect x={x - 3} y={y - 3} width={NW + 6} height={NH + 6} rx={12}
          fill={t.accent} opacity={0.22} />
      )}
      <rect x={x} y={y} width={NW} height={NH} rx={9}
        fill={t.bg}
        stroke={isRoot || isActive ? t.accent : t.border}
        strokeWidth={isRoot ? 1.8 : isActive ? 1.8 : 0.8} />
      <rect x={x} y={y} width={4} height={NH} rx={2} fill={t.accent} />
      <text x={x + 14} y={y + 18} fontSize="10" fontFamily="monospace"
        fontWeight="700" fill={t.accent} letterSpacing="0.10em">
        {t.label.toUpperCase()}{isRoot ? ' · ROOT' : ''}
      </text>
      <text x={x + 14} y={y + 37} fontSize="13" fontFamily="monospace"
        fontWeight="600" fill={t.text}>
        {shortLabel}
      </text>
      <text x={x + 14} y={y + 53} fontSize="11" fontFamily="monospace" fill="#64748b">
        {shortFile} :{node.line}
      </text>
    </g>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function FlowGraph({ flowData, direction = 'forward' }) {
  const [activeId,  setActiveId]  = useState(null);
  const [animReady, setAnimReady] = useState(false);

  // Retrigger grow animation on data or direction change
  useEffect(() => {
    setActiveId(null);
    setAnimReady(false);
    const t = setTimeout(() => setAnimReady(true), 60);
    return () => clearTimeout(t);
  }, [flowData, direction]);

  const handleNodeClick = useCallback(id => {
    setActiveId(prev => prev === id ? null : id);
  }, []);

  if (!flowData) return null;
  if (!flowData.nodes || flowData.edges === undefined) return null;

  const { nodes, edges, root: rootId } = flowData;
  const backward = direction === 'backward';

  const { pos, levels, svgW, svgH } = backward
    ? buildBackwardLayout(nodes, edges, rootId)
    : buildForwardLayout(nodes, edges, rootId);

  const activeNode = nodes.find(n => n.id === activeId);
  const hasActive  = !!activeNode;

  return (
    <>
      <style>{`
        .fg-shell {
          position: relative;
          width: 100vw;
          margin-left: calc(-50vw + 50%);
          min-height: 100vh;
          display: flex;
          flex-direction: row;
          overflow: visible;
        }

        /* graph panel: full width centered → shrinks to 50% left on click */
        .fg-graph-panel {
          position: relative;
          width: 100%;
          display: flex;
          flex-direction: column;
          overflow: visible;
          transition: width 0.45s cubic-bezier(0.4,0,0.2,1);
        }
        .fg-graph-panel.has-active {
          width: 50%;
        }

        .fg-hint {
          text-align: center;
          font-size: 11px;
          color: #334155;
          font-family: 'JetBrains Mono', monospace;
          padding: 10px 0 6px;
          letter-spacing: 0.05em;
          flex-shrink: 0;
          margin: 0;
        }

        /* hide all scrollbars on the graph scroll area */
        .fg-scroll {
          display: flex;
          align-items: flex-start;
          justify-content: center;
          overflow: visible;
        }
        .fg-scroll::-webkit-scrollbar {
          display: none;                /* Chrome/Safari */
        }

        /* code panel: off-screen right → slides in */
        .fg-code-panel {
          position: absolute;
          top: 0;
          right: 0;
          width: 50%;
          height: 100%;
          /* hide scrollbar on code panel too */
          overflow-y: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
          transform: translateX(100%);
          opacity: 0;
          transition: transform 0.45s cubic-bezier(0.4,0,0.2,1),
                      opacity  0.35s ease;
          pointer-events: none;
          /* no border — no white line */
          border-left: none;
        }
        .fg-code-panel::-webkit-scrollbar {
          display: none;
        }
        .fg-code-panel.has-active {
          transform: translateX(0);
          opacity: 1;
          pointer-events: all;
        }

        .fg-empty {
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          color: #1e293b;
          font-size: 12px;
          font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.05em;
        }
      `}</style>

      <div className="fg-shell">

        {/* GRAPH */}
        <div className={`fg-graph-panel ${hasActive ? 'has-active' : ''}`}>
          <p className="fg-hint">Click a node to view its code</p>
          <div className="fg-scroll">
            <svg
              width={svgW}
              height={svgH}
              viewBox={`0 0 ${svgW} ${svgH}`}
              style={{ display: 'block', flexShrink: 0 }}
            >
              <defs>
                <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5"
                  markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M1 1L9 5L1 9" fill="none" stroke="#6366f1"
                    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </marker>
              </defs>

              {edges.map((e, i) => (
                <EdgePath key={i} from={e.from} to={e.to} label={e.label}
                  pos={pos} levels={levels} visible={animReady} backward={backward} />
              ))}

              {nodes.map(nd => (
                <NodeCard
                  key={nd.id}
                  node={nd}
                  pos={pos}
                  isRoot={nd.id === rootId}
                  isActive={nd.id === activeId}
                  onClick={handleNodeClick}
                  level={levels[nd.id] ?? 0}
                  visible={animReady}
                />
              ))}
            </svg>
          </div>
        </div>

        {/* CODE PANEL */}
        <div className={`fg-code-panel ${hasActive ? 'has-active' : ''}`}>
          {activeNode
            ? <CodePanel node={activeNode} onClose={() => setActiveId(null)} />
            : <div className="fg-empty" />
          }
        </div>

      </div>
    </>
  );
}