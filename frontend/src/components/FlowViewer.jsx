import { useState, useEffect } from 'react';
import { Network } from 'lucide-react';
import FlowGraph from './FlowGraph';

export default function FlowViewer({ flowData, graphData, loading, initialDirection = 'forward', maxSteps = 10 }) {
  const [direction, setDirection] = useState(initialDirection);

  // Sync with form input when it changes
  useEffect(() => {
    setDirection(initialDirection);
  }, [initialDirection]);

  if (loading) return null;

  if (!flowData || flowData.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 24px',
        gap: '16px',
      }}>
        <Network style={{ width: 32, height: 32, color: '#1e293b', opacity: 0.5 }} />
        <p style={{
          margin: 0,
          color: '#94a3b8',
          fontSize: '14px',
          fontFamily: "'Inter', sans-serif",
          letterSpacing: '0.01em',
        }}>
          No execution flow loaded yet
        </p>
      </div>
    );
  }

  return (
    <div className="flow-viewer">
      <FlowGraph flowData={graphData} direction={direction} maxSteps={maxSteps} />
    </div>
  );
}
