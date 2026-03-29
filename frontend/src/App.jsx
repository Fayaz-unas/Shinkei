import { useState, useEffect } from 'react';
import { MOCK_FLOWS, resolveFlowKey } from './constants/mockFlows';
import HeroView from './components/HeroView';
import WorkspaceModal from './components/WorkspaceModal';
import GraphView from './components/GraphView';

// ─── View States: hero → workspace → graph ────────────────────────────
function App() {
  const [view, setView] = useState('hero'); // 'hero' | 'workspace' | 'graph'
  const [flow, setFlow] = useState(null);
  const [loading, setLoading] = useState(false);

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
  };

  const handleAnalyze = (url, fnText, forcedKey) => {
    setFlow(null);
    setLoading(true);
    const key = forcedKey || resolveFlowKey(url, fnText);
    setTimeout(() => {
      setFlow(MOCK_FLOWS[key] || MOCK_FLOWS.login);
      setLoading(false);
      setView('graph');
    }, 900);
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
        loading={loading}
        onBackToWorkspace={handleBackToWorkspace}
      />
    </>
  );
}

export default App;