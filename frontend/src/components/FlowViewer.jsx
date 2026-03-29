import { useState } from 'react';
import FlowGraph from './FlowGraph';

export default function FlowViewer({ flowData, graphData, loading }) {
  const [direction, setDirection] = useState('forward');

  if (loading) return null;

  if (!flowData || flowData.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⬡</div>
        <p className="empty-label">No execution flow loaded yet</p>
      </div>
    );
  }

  const dirs = [
    { key: 'forward',  label: 'Forward',  icon: '↓', desc: 'Root → Leaves' },
    { key: 'backward', label: 'Backward', icon: '↑', desc: 'Leaves → Root' },
  ];

  return (
    <div className="flow-viewer">

      {/* Direction selector */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        paddingBottom: 20,
      }}>
        <div style={{
          display: 'flex',
          gap: 2,
          background: 'rgba(15,23,42,0.6)',
          border: '1px solid rgba(71,85,105,0.3)',
          borderRadius: 12,
          padding: 4,
        }}>
          {dirs.map(d => {
            const active = direction === d.key;
            return (
              <button
                key={d.key}
                onClick={() => setDirection(d.key)}
                style={{
                  position: 'relative',
                  background: active
                    ? 'linear-gradient(135deg, rgba(124,58,237,0.25), rgba(99,102,241,0.2))'
                    : 'transparent',
                  border: active
                    ? '1px solid rgba(124,58,237,0.5)'
                    : '1px solid transparent',
                  color: active ? '#c4b5fd' : '#475569',
                  borderRadius: 9,
                  padding: '10px 28px',
                  fontSize: 13,
                  fontFamily: 'JetBrains Mono, monospace',
                  fontWeight: active ? 700 : 500,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'all 0.25s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{
                  fontSize: 16,
                  lineHeight: 1,
                  opacity: active ? 1 : 0.5,
                }}>{d.icon}</span>
                <span>{d.label}</span>
                <span style={{
                  fontSize: 10,
                  opacity: active ? 0.7 : 0.4,
                  fontWeight: 400,
                  letterSpacing: '0.02em',
                  textTransform: 'none',
                  marginLeft: 4,
                }}>{d.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      <FlowGraph flowData={graphData} direction={direction} />
    </div>
  );
}