import { motion, AnimatePresence } from 'framer-motion';
import FlowViewer from './FlowViewer';
import StatsBar from './StatsBar';

export default function GraphView({ isOpen, flow, loading, onBackToWorkspace }) {
  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50"
          style={{ background: '#09090b', overflowY: 'auto', overflowX: 'hidden' }}
        >
          <div className="app-shell" style={{ overflow: 'visible', minHeight: '100vh' }}>
            <div className="orb orb-purple" />
            <div className="orb orb-blue" />
            <div className="orb orb-green" />
            <div className="grid-overlay" />

            {/* Header area with glass backdrop */}
            <div style={{
              background: 'rgba(9,9,11,0.7)',
              backdropFilter: 'blur(16px)',
              borderBottom: '1px solid rgba(124,58,237,0.12)',
              paddingBottom: '28px',
              position: 'relative',
              zIndex: 2,
            }}>
              <div style={{
                padding: '36px 24px 0',
                textAlign: 'center',
                maxWidth: '640px',
                margin: '0 auto',
              }}>
                {/* Badge */}
                <div className="badge" style={{ marginBottom: '20px' }}>⬡ Static AST Analysis Engine</div>

                {/* Title */}
                <h1 style={{
                  fontSize: 'clamp(28px, 5vw, 48px)',
                  fontWeight: 800,
                  letterSpacing: '-0.03em',
                  lineHeight: 1.1,
                  marginBottom: '8px',
                }}>
                  <span className="title-accent">SHINKEI</span>
                </h1>
                <p className="app-kanji" style={{ marginBottom: '20px' }}>神経 / Tree Call Graph Visualizer</p>

                {/* Stats */}
                {flow && !loading && (
                  <div style={{ marginBottom: '20px' }}>
                    <StatsBar flow={flow.nodes} />
                  </div>
                )}

                {/* Back button */}
                <button
                  onClick={onBackToWorkspace}
                  style={{
                    background: 'rgba(124,58,237,0.1)',
                    border: '1px solid rgba(124,58,237,0.25)',
                    borderRadius: '10px',
                    color: '#c4b5fd',
                    fontSize: '13px',
                    padding: '10px 24px',
                    cursor: 'pointer',
                    fontFamily: 'JetBrains Mono, monospace',
                    letterSpacing: '0.06em',
                    transition: 'all 0.2s',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'rgba(124,58,237,0.5)';
                    e.currentTarget.style.background = 'rgba(124,58,237,0.2)';
                    e.currentTarget.style.color = 'white';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'rgba(124,58,237,0.25)';
                    e.currentTarget.style.background = 'rgba(124,58,237,0.1)';
                    e.currentTarget.style.color = '#c4b5fd';
                  }}
                >
                  ← New Analysis
                </button>
              </div>
            </div>

            {(flow || loading) && (
              <div style={{
                maxWidth: '720px',
                margin: '0 auto',
                width: '100%',
                padding: '0 24px',
              }}>
                <FlowViewer
                  flowData={flow ? flow.nodes : null}
                  graphData={flow}
                  loading={loading}
                />
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
