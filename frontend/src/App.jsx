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
  const [isWaitingForRealtime, setIsWaitingForRealtime] = useState(false);
  const [isAutoOpening, setIsAutoOpening] = useState(false); // 👈 New state for browser trigger
  const [isAppReady, setIsAppReady] = useState(false); // 👈 Track if target app is likely open
  const [appUrl, setAppUrl] = useState(''); // 👈 New state for dynamic target URL
  const [isRealtimeSession, setIsRealtimeSession] = useState(false); // 👈 New state
  const [graphDirection, setGraphDirection] = useState('forward');
  const [graphSteps, setGraphSteps] = useState(10);
  const [currentAnalysisId, setCurrentAnalysisId] = useState(0); // 👈 Track request sequence

  const handleOpenWorkspace = () => setView('workspace');

  const handleClose = async () => {
    setView('hero');
    setCurrentAnalysisId(prev => prev + 1); // 👈 Cancel current logic
    try {
      await fetch(`http://${window.location.hostname}:5000/api/analyze/stop`, { method: 'POST' });
    } catch (e) { console.error("Stop failed", e); }
    
    setTimeout(() => {
      setFlow(null);
      setLoading(false); // 👈 Ensure loading is off
      setIsWaitingForRealtime(false);
      setIsRealtimeSession(false);
      setIsAppReady(false);
    }, 500);
  };

  const handleBackToWorkspace = async () => {
    setView('workspace');
    setCurrentAnalysisId(prev => prev + 1); // 👈 Cancel current logic
    try {
      await fetch(`http://${window.location.hostname}:5000/api/analyze/stop`, { method: 'POST' });
    } catch (e) { console.error("Stop failed", e); }

    setFlow(null);
    setTrace(null);
    setLoading(false); // 👈 Ensure loading is off
    setIsWaitingForRealtime(false);
    setIsRealtimeSession(false);
    setIsAppReady(false);
  };

  const handleAnalyzeAgain = async () => {
    setFlow(null);
    setTrace(null);
    setIsWaitingForRealtime(true); // Show waiting UI immediately

    try {
      await fetch(`http://${window.location.hostname}:5000/api/shinkei/v1/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction: graphDirection,
          depth: graphSteps
        }),
      });
      console.log('📡 Real-time session reset. Waiting for next interaction...');
    } catch (err) {
      console.error('Failed to reset real-time session:', err);
      setIsWaitingForRealtime(false); // Reset on error
    }
  };

  // ── Telemetry & Real-time Graph Listener ──
  useEffect(() => {
    const eventSource = new EventSource(`http://${window.location.hostname}:5000/api/shinkei/v1/stream`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'realtime_graph') {
          console.log('🎯 Received real-time graph from backend');
          setFlow(data.flow);
          setTrace(data.trace);
          setIsWaitingForRealtime(false);
          setLoading(false);
        } else if (data.type === 'app_opened') {
          console.log('🌐 Backend triggered browser opening:', data.url);
          setAppUrl(data.url || '');
          setIsAutoOpening(false);
          setIsAppReady(true);
        }
      } catch (err) {
        console.error("Failed to parse SSE event in App.jsx", err);
      }
    };

    return () => eventSource.close();
  }, []);

  const handleAnalyze = async (url, fnText, direction = 'forward', steps = 10, options = null) => {
  const analysisId = currentAnalysisId; // 👈 Capture current ID
  setFlow(null);
  setTrace(null);
  setLoading(true);
  
  const realtime = !fnText;
  setIsWaitingForRealtime(false); // ⛔ Don't auto-arm. Wait for user to press button.
  setIsRealtimeSession(realtime); // 👈 Persist session mode
  
  // 🌐 Trigger auto-open countdown message if realtime
  if (realtime) {
    setIsAutoOpening(true);
    setIsAppReady(false);
    // ⛔ Timeout removed: handling via SSE 'app_opened' event now
  }

  setGraphDirection(direction);
  setGraphSteps(steps);

  try {
    const response = await fetch(`http://${window.location.hostname}:5000/api/analyze`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repoUrl: url,
        entryFunction: fnText,
        direction: direction,
        depth: steps,
        options: options // 👈 Added frontendPort / backendPort
      }),
    });

    const data = await response.json();

    // 🛑 ABORT if a newer analysis was started while we were waiting
    if (analysisId !== currentAnalysisId) return;

    if (!response.ok || !data.success) {
      console.error('Analysis failed:', data.error);
      setFlow(null);
      setTrace(null);
      setLoading(false);
      setIsWaitingForRealtime(false);
      setIsRealtimeSession(false);
      setIsAutoOpening(false);
    } else {
      if (data.mode === 'static') {
        setFlow(data.flow);
        setTrace(data.trace);
        setLoading(false);
      } else {
        // Real-time mode: we stay in loading state until the graph is pushed via SSE
        console.log('📡 Waiting for real-time interaction...');
        setLoading(false); // Main request is done, now we just wait for SSE
      }
    }

  } catch (err) {
    if (analysisId !== currentAnalysisId) return;
    console.error('Network error:', err);
    setFlow(null);
    setTrace(null);
    setLoading(false);
    setIsWaitingForRealtime(false);
    setIsRealtimeSession(false);
    setIsAutoOpening(false);
  } finally {
    if (analysisId === currentAnalysisId) {
      setView('graph');
    }
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
        loading={loading || isWaitingForRealtime}
        onBackToWorkspace={handleBackToWorkspace}
        onAnalyzeAgain={handleAnalyzeAgain}
        initialDirection={graphDirection}
        maxSteps={graphSteps}
        isRealtime={isRealtimeSession}
        isAutoOpening={isAutoOpening}
        isAppReady={isAppReady}
        appUrl={appUrl}
      />
    </>
  );
}

export default App;

