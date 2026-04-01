import { useState, useEffect } from 'react';

import HeroView from './components/HeroView';
import WorkspaceModal from './components/WorkspaceModal';
import GraphView from './components/GraphView';

// ─── View States: hero → workspace → graph ────────────────────────────
function App() {
  const [view, setView] = useState('hero'); // 'hero' | 'workspace' | 'graph'
  const [flow, setFlow] = useState(null);
  const [trace, setTrace] = useState(null);
  const [loading, setLoading] = useState(false);
  const [graphDirection, setGraphDirection] = useState('forward');
  const [graphSteps, setGraphSteps] = useState(10);

  const handleOpenWorkspace = () => setView('workspace');

  const handleClose = () => {
    setView('hero');
    setTimeout(() => {
      setFlow(null);
    }, 500);
  };

  const handleBackToWorkspace = () => {
    setView('workspace');
    setFlow(null);
    setTrace(null);
  };

  // This function now talks to your actual backend
 const handleAnalyze = async (url, fnText, direction = 'forward', steps = 10) => {
  setFlow(null);
  setTrace(null);
  setLoading(true);
  setGraphDirection(direction);
  setGraphSteps(steps);

  try {
    console.log('direction:', direction, 'steps:', steps); // add this
    const response = await fetch('http://localhost:5000/api/analyze', { // 🔁 your backend URL
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repoUrl: url,
        entryFunction: fnText,
        direction: direction,
        depth: steps,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      console.error('Analysis failed:', data.error);
      setFlow(null); // optionally show an error state
      setTrace(null);
    } else {
      setFlow(data.flow); // ✅ data.flow matches what GraphView expects
      setTrace(data.trace);
    }

  } catch (err) {
    console.error('Network error:', err);
    setFlow(null);
    setTrace(null);
  } finally {
    setLoading(false);
    setView('graph');
  }
};

  // Lock body scroll when workspace/graph is open
  useEffect(() => {
    if (view !== 'hero') {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [view]);

  return (
    <>
      <HeroView isActive={view === 'hero'} onOpenWorkspace={handleOpenWorkspace} />
      <WorkspaceModal
        isOpen={view === 'workspace'}
        onClose={handleClose}
        onAnalyze={handleAnalyze}
        loading={loading}
      />
      <GraphView
        isOpen={view === 'graph'}
        flow={flow}
        trace={trace}
        loading={loading}
        onBackToWorkspace={handleBackToWorkspace}
        initialDirection={graphDirection}
        maxSteps={graphSteps}
      />
    </>
  );
}

export default App;
