import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Hexagon, Activity, GitBranch } from 'lucide-react';
import FlowViewer from './FlowViewer';
import StatsBar from './StatsBar';

// Background matching HeroView / WorkspaceModal aesthetic
function FloatingOrbs() {
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
      {/* Directional sweep — mimics GodRays from top-right */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(135deg, rgba(91,33,182,0.12) 0%, rgba(79,70,229,0.06) 25%, transparent 55%)',
      }} />

      {/* Primary glow — top-right (matches GodRays offsetX/Y) */}
      <div style={{
        position: 'absolute', width: '800px', height: '600px',
        right: '-100px', top: '-200px',
        background: 'radial-gradient(ellipse, rgba(109,40,217,0.18) 0%, rgba(79,70,229,0.06) 40%, transparent 70%)',
        filter: 'blur(60px)',
        animation: 'gv-breathe 8s ease-in-out infinite',
      }} />

      {/* Secondary glow — center-left */}
      <div style={{
        position: 'absolute', width: '600px', height: '600px',
        left: '-150px', top: '30%',
        background: 'radial-gradient(circle, rgba(59,7,100,0.12) 0%, transparent 65%)',
        filter: 'blur(50px)',
        animation: 'gv-breathe 10s ease-in-out infinite 3s',
      }} />

      {/* Bloom accent — bottom */}
      <div style={{
        position: 'absolute', width: '700px', height: '400px',
        left: '50%', bottom: '-100px',
        transform: 'translateX(-50%)',
        background: 'radial-gradient(ellipse, rgba(2,132,199,0.06) 0%, transparent 70%)',
        filter: 'blur(40px)',
        animation: 'gv-breathe 12s ease-in-out infinite 5s',
      }} />

      {/* Radial vignette — identical to HeroView */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 80% 60% at 50% 50%, transparent 30%, #07070a 100%)',
        zIndex: 1,
      }} />

      {/* Noise grain — matching HeroView opacity */}
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

export default function GraphView({ isOpen, flow, trace, loading, onBackToWorkspace, initialDirection = 'forward', maxSteps = 10 }) {

  // ── Telemetry Live Stream Logic ──
// ── Telemetry Live Stream Logic ──
  useEffect(() => {
    if (!isOpen) return;

    const eventSource = new EventSource('http://localhost:5000/api/shinkei/v1/stream');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'pulse_batch') {
          // 1. DILATION: How much we "stretch" real time (e.g., 50ms real -> 1s visual)
          const DILATION_FACTOR = 20; 
          // 2. STAGGER: The minimum time gap between pulses (1000ms = 1 second)
          const MIN_GAP_MS = 300;

          data.spans.forEach((pulse, index) => {
            // We calculate delay based on real offset PLUS its position in the batch
            // This guarantees they never fire simultaneously even if offsetMs is 0
            const visualDelay = (pulse.offsetMs * DILATION_FACTOR) + (index * MIN_GAP_MS);

            setTimeout(() => {
              if (pulse.nodeId) {
                animateGraphNode(pulse.nodeId);
                console.log(`🌊 Flow: [${pulse.nodeId}] at visual delay +${visualDelay}ms`);
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
    void target.offsetWidth; // Force Reflow
    target.classList.add('live-pulse');

    // 🟢 Matches the 2-second CSS animation
    
  };
const animateGraphRoute = (routeId, duration) => {
  const el = document.getElementById(routeId);
  if (!el) return;

  // 1. Reset and Force Restart (Same logic as nodes)
  el.classList.remove('route-active');
  void el.offsetWidth; 

  // 2. Trigger the route pulse
  el.classList.add('route-active');
  
  // 3. Cleanup
  setTimeout(() => el.classList.remove('route-active'), 1000);
};

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

          {/* ── Top navigation bar ── */}
          <motion.div
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 20,
              background: 'rgba(7,7,10,0.7)',
              backdropFilter: 'blur(24px) saturate(1.2)',
              WebkitBackdropFilter: 'blur(24px) saturate(1.2)',
              borderBottom: '1px solid rgba(139,92,246,0.08)',
            }}
          >
            <div style={{
              maxWidth: '1400px',
              margin: '0 auto',
              padding: '12px 28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              {/* Left: Back button */}
              <button
                onClick={onBackToWorkspace}
                style={{
                  background: 'rgba(139,92,246,0.06)',
                  border: '1px solid rgba(139,92,246,0.12)',
                  borderRadius: '10px',
                  color: '#a78bfa',
                  fontSize: '13px',
                  padding: '7px 14px',
                  cursor: 'pointer',
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 500,
                  letterSpacing: '0.01em',
                  transition: 'all 0.25s cubic-bezier(0.22,1,0.36,1)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'rgba(139,92,246,0.35)';
                  e.currentTarget.style.background = 'rgba(139,92,246,0.12)';
                  e.currentTarget.style.color = '#c4b5fd';
                  e.currentTarget.style.transform = 'translateX(-2px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'rgba(139,92,246,0.12)';
                  e.currentTarget.style.background = 'rgba(139,92,246,0.06)';
                  e.currentTarget.style.color = '#a78bfa';
                  e.currentTarget.style.transform = 'translateX(0)';
                }}
              >
                <ArrowLeft style={{ width: 14, height: 14 }} />
                Back
              </button>

              {/* Center: Brand */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '9px',
              }}>
                <div style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Hexagon style={{
                    width: 18, height: 18,
                    color: '#7c3aed',
                    opacity: 0.5,
                    animation: 'gv-hex-spin 20s linear infinite',
                  }} />
                </div>
                <span style={{
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: 800,
                  fontSize: '13px',
                  letterSpacing: '0.12em',
                  background: 'linear-gradient(135deg, rgba(196,181,253,0.7), rgba(167,139,250,0.5))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>
                  SHINKEI
                </span>
              </div>

              {/* Right: Status indicator */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '11px',
                fontFamily: "'JetBrains Mono', monospace",
                color: '#64748b',
                letterSpacing: '0.03em',
              }}>
                <Activity style={{
                  width: 12, height: 12,
                  color: flow ? '#22c993' : '#64748b',
                  opacity: 0.8,
                }} />
                <span style={{ color: flow ? '#94a3b8' : '#475569' }}>
                  {flow ? `${flow.nodes?.length || 0} nodes` : 'idle'}
                </span>
              </div>
            </div>
          </motion.div>

          {/* ── Flow label ── */}
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
                <GitBranch style={{ width: 16, height: 16, color: '#7c3aed', opacity: 0.7 }} />
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
                    Call Graph
                  </h2>
                  <p style={{
                    margin: '3px 0 0',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '12px',
                    color: '#64748b',
                    letterSpacing: '0.02em',
                  }}>
                    {flow.nodes?.length || 0} nodes · {flow.edges?.length || 0} connections
                  </p>
                </div>
              </div>
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
              <StatsBar flow={trace} />
            </motion.div>
          )}

          {/* ── Graph content ── */}
          {(flow || loading) && (
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.55, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              style={{
                maxWidth: '1400px',
                margin: '0 auto',
                width: '100%',
                padding: '12px clamp(12px, 3vw, 28px) 100px',
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

          {/* Loading state */}
          {loading && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              style={{
                textAlign: 'center',
                padding: '100px 24px',
                position: 'relative',
                zIndex: 2,
              }}
            >
              <div style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '20px',
              }}>
                {/* Layered spinner */}
                <div style={{ position: 'relative', width: '56px', height: '56px' }}>
                  <div style={{
                    position: 'absolute', inset: 0,
                    border: '2px solid rgba(139,92,246,0.08)',
                    borderTopColor: 'rgba(139,92,246,0.4)',
                    borderRadius: '50%',
                    animation: 'spin 1.2s linear infinite',
                  }} />
                  <div style={{
                    position: 'absolute', inset: '6px',
                    border: '2px solid rgba(99,102,241,0.06)',
                    borderBottomColor: 'rgba(99,102,241,0.3)',
                    borderRadius: '50%',
                    animation: 'spin 0.9s linear infinite reverse',
                  }} />
                  <div style={{
                    position: 'absolute', inset: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Hexagon style={{
                      width: 16, height: 16,
                      color: '#7c3aed',
                      opacity: 0.4,
                      animation: 'gv-breathe 2s ease-in-out infinite',
                    }} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <span style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#cbd5e1',
                    letterSpacing: '-0.01em',
                  }}>
                    Building call graph
                  </span>
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '12px',
                    color: '#64748b',
                    letterSpacing: '0.04em',
                  }}>
                    Parsing AST and resolving edges…
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Styles (Including new Pulse Animations) ── */}
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
            
            /* --- New Telemetry Pulse Animations --- */
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
            
/* --- Telemetry Pulse Animation (2-Second Flow) --- */
  .live-pulse {
    z-index: 100;
  }

  .live-pulse rect:first-of-type {
    stroke: #00ff88 !important; 
    stroke-width: 5px !important; /* Slightly thicker for visibility */
    fill: rgba(0, 255, 136, 0.3) !important;
    filter: drop-shadow(0 0 15px #00ff88) !important;

    transform-box: fill-box;
    transform-origin: center;
    
    /* 🟢 2 Second Duration with a "smooth-in, slow-out" curve */
    animation: shinkei-pulse-animation 2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes shinkei-pulse-animation {
    0% { 
      transform: scale(1); 
      opacity: 1; 
    }
    15% { 
      transform: scale(1.15); /* Aggressive pop */
      filter: drop-shadow(0 0 20px #00ff88);
    }
    40% {
      transform: scale(1.05); /* Linger slightly larger */
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
