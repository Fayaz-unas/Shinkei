import { useEffect, useState, useCallback, useRef } from 'react';
import CodePanel from './CodePanel';
import { NODE_TYPES } from '../constants/nodeTypes';
import {
  NW, NH, PAD, LEVEL_DELAY,
  buildForwardLayout, buildBackwardLayout,
} from '../utils/graphLayout';

const TYPE = NODE_TYPES;

// ── Edge ───────────────────────────────────────────────────────────────────
function EdgePath({ from, to, label, pos, levels, visible, edgeIndex, backward = false }) {
  const fp = pos[from], tp = pos[to];
  if (!fp || !tp) return null;

  const topNode = fp.y <= tp.y ? fp : tp;
  const bottomNode = fp.y <= tp.y ? tp : fp;

  const [sx, sy_start, ex, ey_start] = backward
    ? [PAD + bottomNode.x + NW / 2, PAD + bottomNode.y, PAD + topNode.x + NW / 2, PAD + topNode.y + NH]
    : [PAD + topNode.x + NW / 2, PAD + topNode.y + NH, PAD + bottomNode.x + NW / 2, PAD + bottomNode.y];

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

  const destLevel = Math.max(levels[from] ?? 0, levels[to] ?? 0);
  const gradId = `edge-grad-${edgeIndex}`;
  const flowId = `edge-flow-${edgeIndex}`;

  return (
    <g style={{
      opacity: visible ? 1 : 0,
      transition: `opacity 0.7s ease ${destLevel * LEVEL_DELAY + 150}ms`,
    }}>
      {/* Soft glow layer */}
      <path d={d} fill="none" stroke="rgba(99,102,241,0.08)" strokeWidth="8"
        filter="url(#edge-glow)" />
      {/* Main edge */}
      <path d={d} fill="none" stroke={`url(#${gradId})`} strokeWidth="1.5" opacity="0.7"
        markerEnd="url(#arr)" strokeLinecap="round" />

      {/* Animated flow dot */}
      {visible && (
        <circle r="2.5" fill="#818cf8" opacity="0.6">
          <animateMotion dur={`${2 + edgeIndex * 0.3}s`} repeatCount="indefinite" path={d} />
        </circle>
      )}

      {/* Edge label */}
      {label && (
        <g>
          <rect
            x={(sx + ex) / 2 - label.length * 3.2 - 8}
            y={my - 16}
            width={label.length * 6.4 + 16}
            height={20}
            rx={6}
            fill="rgba(7,7,10,0.9)"
            stroke="rgba(99,102,241,0.12)"
            strokeWidth="0.5"
          />
          <text
            x={(sx + ex) / 2}
            y={my - 3}
            textAnchor="middle" fontSize="10"
            fontFamily="'JetBrains Mono', monospace" fill="#818cf8" letterSpacing="0.04em" fontWeight="500"
          >
            {label}
          </text>
        </g>
      )}
      {/* Gradient def */}
      <defs>
        <linearGradient id={gradId} x1={sx} y1={sy_start} x2={ex} y2={ey_start} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.35" />
          <stop offset="50%" stopColor="#818cf8" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.35" />
        </linearGradient>
      </defs>
    </g>
  );
}

// ── Node ───────────────────────────────────────────────────────────────────
function NodeCard({ node, pos, isRoot, isActive, onClick, level, visible }) {
  const [hovered, setHovered] = useState(false);
  const p = pos[node.id];
  if (!p) return null;

  const x = PAD + p.x;
  const y = PAD + p.y;
  const t = TYPE[node.type] || TYPE.function;
  const shortLabel = node.label.length > 22 ? node.label.slice(0, 21) + '…' : node.label;
  const shortFile  = node.file?.length > 24 ? '…' + node.file.slice(-23) : (node.file || '');
  const lineNum    = node.startLine ?? node.line ?? null;
  const delay      = level * LEVEL_DELAY;
  const isHighlighted = isRoot || isActive || hovered;

  return (
    <g
        id={node.nodeId}
      style={{
        cursor: 'pointer',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0px)' : 'translateY(18px)',
        transition: `opacity 0.7s ease ${delay}ms, transform 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
      }}
      onClick={() => onClick(node.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Outer glow for highlighted */}
      {isHighlighted && (
        <rect x={x - 5} y={y - 5} width={NW + 10} height={NH + 10} rx={15}
          fill="none" stroke={t.accent} strokeWidth="1" opacity={0.2}
          filter="url(#node-glow)" />
      )}

      {/* Root halo */}
      {isRoot && (
        <>
          <rect x={x - 8} y={y - 8} width={NW + 16} height={NH + 16} rx={18}
            fill="none" stroke={t.accent} strokeWidth="0.5" opacity={0.15}
            strokeDasharray="6 4" />
          <rect x={x - 3} y={y - 3} width={NW + 6} height={NH + 6} rx={14}
            fill={t.glow} opacity={0.08} />
        </>
      )}

      {/* Card background */}
      <rect x={x} y={y} width={NW} height={NH} rx={12}
        fill={isHighlighted ? t.bg.replace('0.08', '0.14') : t.bg}
        stroke={isHighlighted ? t.accent : t.border}
        strokeWidth={isHighlighted ? 1.2 : 0.5}
        style={{ transition: 'all 0.25s ease' }}
      />

      {/* Top edge glow line */}
      {isHighlighted && (
        <line x1={x + 20} y1={y} x2={x + NW - 20} y2={y}
          stroke={t.accent} strokeWidth="1.5" opacity={0.4}
          strokeLinecap="round" />
      )}

      {/* Left accent bar */}
      <rect x={x} y={y + 10} width={2.5} height={NH - 20} rx={1.25} fill={t.accent}
        opacity={isHighlighted ? 0.9 : 0.5}
        style={{ transition: 'opacity 0.2s' }} />

      {/* Type badge */}
      <text x={x + 14} y={y + 20} fontSize="10" fontFamily="'JetBrains Mono', monospace"
        fontWeight="700" fill={t.accent} letterSpacing="0.1em"
        opacity={isHighlighted ? 1 : 0.85}
        style={{ transition: 'opacity 0.2s' }}>
        {t.label.toUpperCase()}{isRoot ? '  ·  ROOT' : ''}
      </text>

      {/* Function label */}
      <text x={x + 14} y={y + 39} fontSize="13" fontFamily="'JetBrains Mono', monospace"
        fontWeight="600" fill={isHighlighted ? '#f8fafc' : '#e2e8f0'}
        style={{ transition: 'fill 0.2s' }}>
        {shortLabel}
      </text>

      {/* File info */}
      <text x={x + 14} y={y + 55} fontSize="10" fontFamily="'JetBrains Mono', monospace"
        fill="#64748b" opacity={isHighlighted ? 0.85 : 0.7}
        style={{ transition: 'opacity 0.2s' }}>
        {shortFile}{lineNum != null ? ` :${lineNum}` : ''}
      </text>


      {/* Active click indicator */}
      {isActive && (
        <circle cx={x + NW - 12} cy={y + 12} r="3" fill={t.accent} opacity={0.7}>
          <animate attributeName="opacity" values="0.7;0.3;0.7" dur="1.5s" repeatCount="indefinite" />
        </circle>
      )}
    </g>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function FlowGraph({ flowData, direction = 'forward', maxSteps = 10 }) {
  const [activeId,  setActiveId]  = useState(null);
  const [animReady, setAnimReady] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    setActiveId(null);
    setAnimReady(false);
    const t = setTimeout(() => setAnimReady(true), 60);
    return () => clearTimeout(t);
  }, [flowData, direction, maxSteps]);

  const handleNodeClick = useCallback(id => {
    setActiveId(prev => prev === id ? null : id);
  }, []);

  if (!flowData) return null;
  if (!flowData.nodes || flowData.edges === undefined) return null;

  const { nodes, edges, root: rootId } = flowData;
  const backward = direction === 'backward';

  const { pos, levels, svgW, svgH, filteredNodes, filteredEdges } = backward
    ? buildBackwardLayout(nodes, edges, rootId, maxSteps)
    : buildForwardLayout(nodes, edges, rootId, maxSteps);

  const activeNode = filteredNodes.find(n => n.id === activeId);
  const hasActive  = !!activeNode;

  useEffect(() => {
    if (!scrollRef.current || hasActive) return;

    const frame = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
      el.scrollLeft = maxScroll / 2;
    });

    return () => cancelAnimationFrame(frame);
  }, [svgW, hasActive, direction, maxSteps]);

  return (
    <>
      <style>{`
        .fg-shell {
          --fg-code-panel-width: clamp(432px, 40.8vw, 576px);
          --fg-code-panel-height: clamp(420px, 72vh, 820px);
          position: relative;
          width: 100%;
          max-width: 100%;
          display: flex;
          flex-direction: row;
          align-items: flex-start;
          gap: 0;
          overflow: visible;
          transition: gap 0.5s cubic-bezier(0.22,1,0.36,1);
        }
        .fg-shell.has-active {
          gap: 16px;
        }

        .fg-graph-panel {
          position: relative;
          width: 100%;
          min-width: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transition: width 0.5s cubic-bezier(0.22,1,0.36,1);
        }
        .fg-graph-panel.has-active {
          width: calc(100% - var(--fg-code-panel-width) - 16px);
        }

        .fg-hint {
          text-align: center;
          font-size: 12px;
          color: rgba(100,116,139,0.7);
          font-family: 'Inter', sans-serif;
          padding: 6px 0 8px;
          letter-spacing: 0.03em;
          flex-shrink: 0;
          margin: 0;
        }

        .fg-scroll {
          width: 100%;
          max-width: 100%;
          overflow-x: auto;
          overflow-y: visible;
          box-sizing: border-box;
          padding: 0 8px 8px;
          scrollbar-width: thin;
        }

        .fg-scroll-inner {
          width: fit-content;
          min-width: 100%;
          margin: 0 auto;
          padding: 0 24px;
          box-sizing: border-box;
          display: flex;
          justify-content: center;
        }

        .fg-code-panel {
          position: sticky;
          top: 84px;
          align-self: flex-start;
          flex: 0 0 0;
          width: 0;
          max-width: 0;
          height: min(var(--fg-code-panel-height), calc(100vh - 96px));
          overflow: hidden;
          scrollbar-width: none;
          -ms-overflow-style: none;
          transform: translateX(24px);
          opacity: 0;
          transition: flex-basis 0.5s cubic-bezier(0.22,1,0.36,1),
                      width 0.5s cubic-bezier(0.22,1,0.36,1),
                      max-width 0.5s cubic-bezier(0.22,1,0.36,1),
                      transform 0.5s cubic-bezier(0.22,1,0.36,1),
                      opacity 0.4s ease;
          pointer-events: none;
          border: 1px solid transparent;
          border-radius: 16px;
          background: rgba(15,10,30,0.97);
          box-shadow: 0 18px 48px rgba(2,6,23,0.28);
        }
        .fg-code-panel::-webkit-scrollbar {
          display: none;
        }
        .fg-code-panel.has-active {
          flex: 0 0 var(--fg-code-panel-width);
          width: var(--fg-code-panel-width);
          max-width: min(100%, var(--fg-code-panel-width));
          transform: translateX(0);
          opacity: 1;
          pointer-events: all;
          border-color: rgba(139,92,246,0.08);
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

        @media (max-width: 1024px) {
          .fg-shell,
          .fg-shell.has-active {
            flex-direction: column;
            gap: 12px;
          }

          .fg-graph-panel,
          .fg-graph-panel.has-active,
          .fg-code-panel,
          .fg-code-panel.has-active {
            position: relative;
            width: 100%;
            max-width: 100%;
            transform: none;
          }

          .fg-code-panel {
            display: none;
            flex-basis: auto;
            height: min(70vh, 420px);
            max-width: 100%;
            opacity: 1;
            pointer-events: none;
            border-left: none;
            border-top: 1px solid rgba(139,92,246,0.08);
            margin-top: 0;
          }

          .fg-code-panel.has-active {
            display: block;
            pointer-events: all;
          }
        }
      `}</style>

      <div className={`fg-shell ${hasActive ? 'has-active' : ''}`}>

        {/* GRAPH */}
        <div className={`fg-graph-panel ${hasActive ? 'has-active' : ''}`}>
          <p className="fg-hint">Click a node to inspect</p>
          <div ref={scrollRef} className="fg-scroll">
            <div className="fg-scroll-inner">
              <svg
                width={svgW}
                height={svgH}
                viewBox={`0 0 ${svgW} ${svgH}`}
                style={{
                  display: 'block',
                  margin: '0 auto',
                  width: `${svgW}px`,
                  height: `${svgH}px`,
                  maxWidth: 'none',
                  overflow: 'visible',
                }}
              >
              <defs>
                {/* Arrow marker */}
                <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5"
                  markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M1 1L9 5L1 9" fill="none" stroke="#818cf8"
                    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                </marker>

                {/* Glow filters */}
                <filter id="edge-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                </filter>
                <filter id="node-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                </filter>
              </defs>

              {filteredEdges.map((e, i) => (
                <EdgePath key={i} from={e.from} to={e.to} label={e.label}
                  pos={pos} levels={levels} visible={animReady}
                  edgeIndex={i} backward={backward} />
              ))}

                {filteredNodes.map(nd => (
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
