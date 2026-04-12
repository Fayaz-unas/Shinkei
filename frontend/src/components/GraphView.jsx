import React, { useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Hexagon, Activity, GitBranch, Layers, Zap } from 'lucide-react';
import FlowViewer from './FlowViewer';
import StatsBar from './StatsBar';
import { API_BASE_URL } from '../config';

// ── Premium loading animation — neural network pulse ──
function NeuralLoader() {
  const nodes = [
    { x: 50, y: 20, delay: 0 },
    { x: 25, y: 45, delay: 0.2 },
    { x: 75, y: 45, delay: 0.3 },
    { x: 12, y: 70, delay: 0.5 },
    { x: 40, y: 70, delay: 0.6 },
    { x: 60, y: 70, delay: 0.7 },
    { x: 88, y: 70, delay: 0.4 },
  ];

  const edges = [
    [0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6],
  ];

  return (
    <div style={{
      position: 'relative',
      width: '120px',
      height: '100px',
      margin: '0 auto',
    }}>
      <svg width="120" height="100" viewBox="0 0 120 100" style={{ overflow: 'visible' }}>
        {/* Edges */}
        {edges.map(([a, b], i) => {
          const from = nodes[a];
          const to = nodes[b];
          return (
            <g key={`edge-${i}`}>
              <line
                x1={from.x * 1.2} y1={from.y}
                x2={to.x * 1.2} y2={to.y}
                stroke="rgba(139,92,246,0.15)"
                strokeWidth="1"
              />
              {/* Animated pulse along edge */}
              <circle r="2" fill="#a78bfa" opacity="0.6">
                <animateMotion
                  dur={`${1.5 + i * 0.3}s`}
                  repeatCount="indefinite"
                  path={`M${from.x * 1.2},${from.y} L${to.x * 1.2},${to.y}`}
                />
                <animate attributeName="opacity" values="0;0.8;0" dur="1.5s" repeatCount="indefinite" />
              </circle>
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node, i) => (
          <g key={`node-${i}`}>
            <circle
              cx={node.x * 1.2} cy={node.y} r="5"
              fill="rgba(139,92,246,0.15)"
              stroke="rgba(139,92,246,0.3)"
              strokeWidth="1"
            >
              <animate
                attributeName="r"
                values="4;6;4"
                dur="2s"
                begin={`${node.delay}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="fill"
                values="rgba(139,92,246,0.15);rgba(139,92,246,0.3);rgba(139,92,246,0.15)"
                dur="2s"
                begin={`${node.delay}s`}
                repeatCount="indefinite"
              />
            </circle>
            {/* Glow */}
            <circle
              cx={node.x * 1.2} cy={node.y} r="8"
              fill="none"
              stroke="rgba(139,92,246,0.1)"
              strokeWidth="1"
            >
              <animate
                attributeName="r"
                values="6;12;6"
                dur="2s"
                begin={`${node.delay}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.5;0;0.5"
                dur="2s"
                begin={`${node.delay}s`}
                repeatCount="indefinite"
              />
            </circle>
          </g>
        ))}
      </svg>
    </div>
  );
}

// Background matching HeroView / WorkspaceModal aesthetic
function FloatingOrbs() {
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
      {/* Directional sweep */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(135deg, rgba(91,33,182,0.12) 0%, rgba(79,70,229,0.06) 25%, transparent 55%)',
      }} />

      {/* Primary glow */}
      <div style={{
        position: 'absolute', width: '800px', height: '600px',
        right: '-100px', top: '-200px',
        background: 'radial-gradient(ellipse, rgba(109,40,217,0.18) 0%, rgba(79,70,229,0.06) 40%, transparent 70%)',
        filter: 'blur(60px)',
        animation: 'gv-breathe 8s ease-in-out infinite',
      }} />

      {/* Secondary glow */}
      <div style={{
        position: 'absolute', width: '600px', height: '600px',
        left: '-150px', top: '30%',
        background: 'radial-gradient(circle, rgba(59,7,100,0.12) 0%, transparent 65%)',
        filter: 'blur(50px)',
        animation: 'gv-breathe 10s ease-in-out infinite 3s',
      }} />

      {/* Bloom accent */}
      <div style={{
        position: 'absolute', width: '700px', height: '400px',
        left: '50%', bottom: '-100px',
        transform: 'translateX(-50%)',
        background: 'radial-gradient(ellipse, rgba(2,132,199,0.06) 0%, transparent 70%)',
        filter: 'blur(40px)',
        animation: 'gv-breathe 12s ease-in-out infinite 5s',
      }} />

      {/* Radial vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 80% 60% at 50% 50%, transparent 30%, #07070a 100%)',
        zIndex: 1,
      }} />

      {/* Noise grain */}
      <div style={{
        position: 'absolute', inset: 0,
        opacity: 0.032,
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'repeat',
        backgroundSize: '128px 128px',
        zIndex: 2,
      }} />
    </div>
  );
}

export default function GraphView({
  isOpen,
  flow,
  trace,
  loading,
  onBackToWorkspace,
  onAnalyzeAgain,
  initialDirection = 'forward',
  maxSteps = 10,
  isRealtime = false,
  isAutoOpening = false,
  isAppReady = false,
  appUrl = ''
}) {

  // ── Telemetry Live Stream Logic ──
  useEffect(() => {
    if (!isOpen) return;

    const eventSource = new EventSource(`${API_BASE_URL}/api/shinkei/v1/stream`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'pulse_batch') {
          const DILATION_FACTOR = 1;
          const MIN_GAP_MS = 100;

          data.spans.forEach((pulse, index) => {
            const visualDelay = (pulse.offsetMs * DILATION_FACTOR) + (index * MIN_GAP_MS);

            setTimeout(() => {
              if (pulse.nodeId) {
                animateGraphNode(pulse.nodeId);
              } else if (pulse.route) {
                const routeId = `${pulse.method}:${pulse.route}`;
                animateGraphRoute(routeId, pulse.durationMs);
              }
            }, visualDelay);
          });
        }
      } catch (err) {
        console.error("Failed to parse telemetry event", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("EventSource failed:", err);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [isOpen]);

  // ── Animation Helpers ──
  const animateGraphNode = (nodeId) => {
    var target = document.getElementById(nodeId);
    if (!target) return;

    target.classList.remove('live-pulse');
    void target.offsetWidth;
    target.classList.add('live-pulse');
  };

  const animateGraphRoute = (routeId, duration) => {
    const el = document.getElementById(routeId);
    if (!el) return;

    el.classList.remove('route-active');
    void el.offsetWidth;

    el.classList.add('route-active');
    setTimeout(() => el.classList.remove('route-active'), 1000);
  };

  const connectionCount = useMemo(() => {
    if (!Array.isArray(flow?.edges)) {
      return 0;
    }

    const uniqueConnections = new Set(
      flow.edges
        .filter(e => e && e.from != null && e.to != null)
        .map(e => `${e.from}->${e.to}`)
    );

    return uniqueConnections.size;
  }, [flow]);

  const totalNodeCount = useMemo(() => {
    if (!Array.isArray(flow?.nodes)) {
      return 0;
    }

    const uniqueNodes = new Set(
      flow.nodes
        .filter(n => n && n.id != null)
        .map(n => String(n.id))
    );

    return uniqueNodes.size;
  }, [flow]);

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-50"
          style={{ background: '#07070a', overflowY: 'auto', overflowX: 'hidden' }}
        >
          <FloatingOrbs />

          {/* ── Top navigation bar (glassmorphism) ── */}
          <motion.div
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 20,
              background: 'rgba(7,7,10,0.6)',
              backdropFilter: 'blur(24px) saturate(1.4)',
              WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
              borderBottom: '1px solid rgba(139,92,246,0.06)',
            }}
          >
            {/* Top accent line */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: '10%',
              right: '10%',
              height: '1px',
              background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.2), transparent)',
            }} />

            <div style={{
              maxWidth: '1400px',
              margin: '0 auto',
              padding: '14px 28px',
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr',
              alignItems: 'center',
              gap: '16px',
            }}>
              {/* Left: Back */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                <button
                  onClick={onBackToWorkspace}
                  style={{
                    background: 'rgba(139,92,246,0.05)',
                    border: '1px solid rgba(139,92,246,0.1)',
                    borderRadius: '100px',
                    color: '#a78bfa',
                    fontSize: '12px',
                    padding: '7px 16px 7px 12px',
                    cursor: 'pointer',
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 500,
                    letterSpacing: '0.01em',
                    transition: 'all 0.25s cubic-bezier(0.22,1,0.36,1)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'rgba(139,92,246,0.25)';
                    e.currentTarget.style.background = 'rgba(139,92,246,0.1)';
                    e.currentTarget.style.color = '#c4b5fd';
                    e.currentTarget.style.transform = 'translateX(-2px)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'rgba(139,92,246,0.1)';
                    e.currentTarget.style.background = 'rgba(139,92,246,0.05)';
                    e.currentTarget.style.color = '#a78bfa';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  <ArrowLeft style={{ width: 13, height: 13 }} />
                  Back
                </button>
              </div>

              {/* Center: Brand */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '9px',
                justifyContent: 'center',
              }}>
                <div style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {/* Subtle glow ring */}
                  <div style={{
                    position: 'absolute',
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(124,58,237,0.15), transparent)',
                    filter: 'blur(4px)',
                  }} />
                  <Hexagon style={{
                    width: 18, height: 18,
                    color: '#7c3aed',
                    opacity: 0.6,
                    animation: 'gv-hex-spin 20s linear infinite',
                  }} />
                </div>
                <span style={{
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: 800,
                  fontSize: '13px',
                  letterSpacing: '0.12em',
                  background: 'linear-gradient(135deg, rgba(196,181,253,0.8), rgba(167,139,250,0.6))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>
                  SHINKEI
                </span>
              </div>

              {/* Right: Status + Capture button */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
                {/* Capture Next (Real-time only) */}
                {isRealtime && onAnalyzeAgain && (
                  <button
                    onClick={onAnalyzeAgain}
                    style={{
                      background: 'rgba(34,201,147,0.06)',
                      border: '1px solid rgba(34,201,147,0.12)',
                      borderRadius: '100px',
                      color: '#22c993',
                      fontSize: '12px',
                      padding: '7px 16px 7px 12px',
                      cursor: 'pointer',
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 500,
                      letterSpacing: '0.01em',
                      transition: 'all 0.25s cubic-bezier(0.22,1,0.36,1)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'rgba(34,201,147,0.3)';
                      e.currentTarget.style.background = 'rgba(34,201,147,0.1)';
                      e.currentTarget.style.color = '#34d399';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 4px 16px rgba(34,201,147,0.12)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'rgba(34,201,147,0.12)';
                      e.currentTarget.style.background = 'rgba(34,201,147,0.06)';
                      e.currentTarget.style.color = '#22c993';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <Activity style={{ width: 12, height: 12 }} />
                    Capture Next
                  </button>
                )}

                {/* Status pill */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '11px',
                  fontFamily: "'JetBrains Mono', monospace",
                  color: '#64748b',
                  letterSpacing: '0.03em',
                  padding: '5px 12px',
                  borderRadius: '100px',
                  background: flow ? 'rgba(34,201,147,0.05)' : 'rgba(255,255,255,0.02)',
                  border: flow ? '1px solid rgba(34,201,147,0.08)' : '1px solid rgba(255,255,255,0.04)',
                  transition: 'all 0.3s ease',
                }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    {flow && (
                      <div style={{
                        position: 'absolute',
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: 'rgba(34,201,147,0.15)',
                        animation: 'sk-pulse 2s ease-in-out infinite',
                      }} />
                    )}
                    <Activity style={{
                      width: 12, height: 12,
                      color: flow ? '#22c993' : '#64748b',
                      opacity: 0.8,
                      position: 'relative',
                    }} />
                  </div>
                  <span style={{ color: flow ? '#94a3b8' : '#475569' }}>
                    {flow ? `${flow.nodes?.length || 0} nodes` : 'idle'}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* ── Flow label + breadcrumb ── */}
          {flow && !loading && (
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
              style={{
                maxWidth: '800px',
                margin: '0 auto',
                padding: '28px 28px 0',
                position: 'relative',
                zIndex: 2,
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '20px',
              }}>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: 'rgba(124,58,237,0.08)',
                  border: '1px solid rgba(124,58,237,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <GitBranch style={{ width: 16, height: 16, color: '#7c3aed', opacity: 0.8 }} />
                </div>
                <div>
                  <h2 style={{
                    margin: 0,
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 700,
                    fontSize: '18px',
                    color: '#f1f5f9',
                    letterSpacing: '-0.02em',
                    lineHeight: 1.2,
                  }}>
                    Execution Graph
                  </h2>
                  <div style={{
                    margin: '4px 0 0',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '11px',
                    color: '#64748b',
                    letterSpacing: '0.02em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}>
                    <Layers style={{ width: 11, height: 11, opacity: 0.6 }} />
                    {flow.nodes?.length || 0} nodes
                    <span style={{ color: '#334155' }}>·</span>
                    <Zap style={{ width: 11, height: 11, opacity: 0.6 }} />
                    {connectionCount} connections
                  </div>
                </div>
              </div>

              {/* Section divider */}
              <div style={{
                height: '1px',
                background: 'linear-gradient(90deg, rgba(139,92,246,0.15), transparent)',
                marginBottom: '4px',
              }} />
            </motion.div>
          )}

          {/* ── Stats section ── */}
          {flow && !loading && (
            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
              style={{
                maxWidth: '800px',
                margin: '0 auto',
                padding: '0 28px',
                position: 'relative',
                zIndex: 2,
              }}
            >
              <StatsBar
                flow={Array.isArray(trace) && trace.length > 0 ? trace : (flow.nodes || [])}
                totalNodes={totalNodeCount}
              />
            </motion.div>
          )}

          {/* ── Graph content ── */}
          {flow && (
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.55, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              style={{
                width: '100vw',
                maxWidth: '100vw',
                margin: 0,
                padding: '12px 0 100px',
                position: 'relative',
                zIndex: 2,
                boxSizing: 'border-box',
              }}
            >
              <FlowViewer
                flowData={flow ? flow.nodes : null}
                graphData={flow}
                loading={loading}
                initialDirection={initialDirection}
                maxSteps={maxSteps}
              />
            </motion.div>
          )}

          {/* Loading / Ready-to-Arm state */}
          {(loading || (isRealtime && !flow)) && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              style={{
                textAlign: 'center',
                padding: flow ? '40px 24px' : '12vh 24px',
                position: 'relative',
                zIndex: 2,
              }}
            >
              <div style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '24px',
                width: '100%',
              }}>
                {/* Neural network loader */}
                {(loading || isAutoOpening) && <NeuralLoader />}

                {/* Status Text */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '16px',
                    fontWeight: 600,
                    color: '#e2e8f0',
                    letterSpacing: '-0.01em',
                    textAlign: 'center',
                  }}>
                    {isAutoOpening
                      ? 'Spinning Up Environment'
                      : loading
                        ? (isRealtime ? 'Listening for Events' : 'Tracing Execution Paths')
                        : isAppReady
                          ? 'Ready to Capture'
                          : 'Initializing…'}
                  </span>
                  <span style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '13px',
                    color: 'rgba(148,163,184,0.5)',
                    letterSpacing: '0.01em',
                    textAlign: 'center',
                    maxWidth: '380px',
                    lineHeight: 1.6,
                    fontWeight: 400,
                  }}>
                    {isAutoOpening
                      ? 'Your target app will open automatically in a few seconds.'
                      : loading
                        ? 'Interact with the target app — we\'ll capture the execution flow.'
                        : isAppReady
                          ? `Hit "Capture Next" above, then click anything in ${appUrl || 'your app'}.`
                          : 'Setting up the analysis engine…'}
                  </span>

                  {/* Loading progress bar */}
                  {(loading || isAutoOpening) && (
                    <div style={{
                      width: '200px',
                      height: '2px',
                      background: 'rgba(139,92,246,0.1)',
                      borderRadius: '1px',
                      overflow: 'hidden',
                      marginTop: '8px',
                    }}>
                      <div style={{
                        width: '40%',
                        height: '100%',
                        background: 'linear-gradient(90deg, #7c3aed, #6366f1)',
                        borderRadius: '1px',
                        animation: 'sk-shimmer 1.5s ease-in-out infinite',
                      }} />
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Styles ── */}
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
            @keyframes gv-breathe {
              0%, 100% { opacity: 0.7; transform: scale(1); }
              50% { opacity: 1; transform: scale(1.04); }
            }
            @keyframes gv-hex-spin {
              to { transform: rotate(360deg); }
            }
            
            /* --- Telemetry Pulse Animations --- */
            @keyframes pulse-glow {
              0% {
                transform: scale(1);
                box-shadow: 0 0 0px rgba(0, 255, 136, 0);
              }
              30% {
                transform: scale(1.05);
                box-shadow: 0 0 25px rgba(0, 255, 136, 0.8);
                border-color: #00ff88;
              }
              100% {
                transform: scale(1);
                box-shadow: 0 0 0px rgba(0, 255, 136, 0);
              }
            }
            
            .live-pulse {
              z-index: 100;
            }

            .live-pulse rect:first-of-type {
              stroke: #00ff88 !important; 
              stroke-width: 5px !important;
              fill: rgba(0, 255, 136, 0.3) !important;
              filter: drop-shadow(0 0 15px #00ff88) !important;
              transform-box: fill-box;
              transform-origin: center;
              animation: shinkei-pulse-animation 2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }

            @keyframes shinkei-pulse-animation {
              0% { 
                transform: scale(1); 
                opacity: 1; 
              }
              15% { 
                transform: scale(1.15);
                filter: drop-shadow(0 0 20px #00ff88);
              }
              40% {
                transform: scale(1.05);
              }
              100% { 
                transform: scale(1); 
                opacity: 0.8; 
                filter: drop-shadow(0 0 0px #00ff88);
              }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
