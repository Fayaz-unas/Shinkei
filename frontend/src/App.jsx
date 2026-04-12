import { useState, useEffect } from 'react';
import { API_BASE_URL } from './config';

import HeroView from './components/HeroView';
import WorkspaceModal from './components/WorkspaceModal';
import GraphView from './components/GraphView';
import UIEditorView from './components/UIEditorView';

// ─── View States: hero → workspace → graph | editor ────────────────────────────
function App() {
  const [view, setView] = useState('hero'); // 'hero' | 'workspace' | 'graph' | 'editor'
  const [flow, setFlow] = useState(null);
  const [trace, setTrace] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isWaitingForRealtime, setIsWaitingForRealtime] = useState(false);
  const [isAutoOpening, setIsAutoOpening] = useState(false); // 👈 New state for browser trigger
  const [isAppReady, setIsAppReady] = useState(false); // 👈 Track if target app is likely open
  const [appUrl, setAppUrl] = useState(''); // 👈 New state for dynamic target URL
  const [isRealtimeSession, setIsRealtimeSession] = useState(false); // 👈 New state
  const [isEditorSession, setIsEditorSession] = useState(false); // 👈 New state
  const [repoRoot, setRepoRoot] = useState(''); // 👈 Store the absolute path for editor
  const [graphDirection, setGraphDirection] = useState('forward');
  const [graphSteps, setGraphSteps] = useState(10);
  const [currentAnalysisId, setCurrentAnalysisId] = useState(0); // 👈 Track request sequence

  const handleOpenWorkspace = () => setView('workspace');

  const handleClose = async () => {
    setView('hero');
    setCurrentAnalysisId(prev => prev + 1); // 👈 Cancel current logic
    try {
      await fetch(`${API_BASE_URL}/api/analyze/stop`, { method: 'POST' });
    } catch (e) { console.error("Stop failed", e); }
    
    setTimeout(() => {
      setFlow(null);
      setLoading(false); // 👈 Ensure loading is off
      setIsWaitingForRealtime(false);
      setIsRealtimeSession(false);
      setIsEditorSession(false);
      setIsAppReady(false);
    }, 500);
  };

  const handleBackToWorkspace = async () => {
    setView('workspace');
    setCurrentAnalysisId(prev => prev + 1); // 👈 Cancel current logic
    try {
      await fetch(`${API_BASE_URL}/api/analyze/stop`, { method: 'POST' });
    } catch (e) { console.error("Stop failed", e); }

    setFlow(null);
    setTrace(null);
    setLoading(false); // 👈 Ensure loading is off
    setIsWaitingForRealtime(false);
    setIsRealtimeSession(false);
    setIsEditorSession(false);
    setIsAppReady(false);
  };

  const handleAnalyzeAgain = async () => {
    setFlow(null);
    setTrace(null);
    setIsWaitingForRealtime(true); // Show waiting UI immediately

    try {
      await fetch(`${API_BASE_URL}/api/shinkei/v1/reset`, {
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
    const eventSource = new EventSource(`${API_BASE_URL}/api/shinkei/v1/stream`);

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
  
  const isEditor = options?.uiEditor === true;
  const realtime = !fnText;
  
  setIsWaitingForRealtime(false); 
  setIsRealtimeSession(realtime); 
  setIsEditorSession(isEditor);
  
  // 🌐 Trigger auto-open countdown message if realtime or editor
  if (realtime) {
    setIsAutoOpening(true);
    setIsAppReady(false);
  }

  setGraphDirection(direction);
  setGraphSteps(steps);

  try {
    const response = await fetch(`${API_BASE_URL}/api/analyze`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repoUrl: url,
        entryFunction: fnText,
        direction: direction,
        depth: steps,
        options: options
      }),
    });

    const data = await response.json();

    // 🛑 ABORT if a newer analysis was started while we were waiting
    if (analysisId !== currentAnalysisId) {
      return { success: false, error: 'Analysis cancelled.' };
    }

    if (!response.ok || !data.success) {
      console.error('Analysis failed:', data.error);
      setFlow(null);
      setTrace(null);
      setLoading(false);
      setIsWaitingForRealtime(false);
      setIsRealtimeSession(false);
      setIsEditorSession(false);
      setIsAutoOpening(false);
      return {
        success: false,
        error: data?.error || 'Analysis failed. Please check your repository and function name.'
      };
    } else {
      if (data.repoRoot) setRepoRoot(data.repoRoot);

      if (data.mode === 'static') {
        setFlow(data.flow);
        setTrace(data.trace);
        setLoading(false);
        setView('graph');
        return { success: true };
      } else {
        // Real-time/editor mode: wait for the environment to report readiness.
        console.log(`📡 Waiting for ${isEditor ? 'UI editor' : 'real-time'} interaction...`);
        setLoading(false); // Main request is done, now we just wait for SSE
        setView(isEditor ? 'editor' : 'graph');
      }
    }

  } catch (err) {
    if (analysisId !== currentAnalysisId) {
      return { success: false, error: 'Analysis cancelled.' };
    }
    console.error('Network error:', err);
    setFlow(null);
    setTrace(null);
    setLoading(false);
    setIsWaitingForRealtime(false);
    setIsRealtimeSession(false);
    setIsEditorSession(false);
    setIsAutoOpening(false);
  }
};

  // Lock body scroll when workspace/graph/editor is open
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
      <UIEditorView
        isOpen={view === 'editor'}
        appUrl={appUrl}
        onClose={handleBackToWorkspace}
        repoRoot={repoRoot}
        isAppReady={isAppReady}
      />
    </>
  );
}

export default App;
