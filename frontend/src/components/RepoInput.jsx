import { useState } from 'react';

export default function RepoInput({ onAnalyze, loading, analyzed }) {
  const [url, setUrl] = useState('');
  const [fnText, setFnText] = useState('');
  const [direction, setDirection] = useState('forward');
  const [steps, setSteps] = useState('10');
  const [error, setError] = useState('');
  const [isRealtime, setIsRealtime] = useState(false);

  const handleSubmit = () => {
    if (!url.trim()) { setError('Please enter a GitHub repository URL.'); return; }
    if (!isRealtime && !fnText.trim()) { setError('Please enter a function or action to analyse.'); return; }
    setError('');
    
    // Use states for Static mode, or defaults for Real-time
    const finalDirection = isRealtime ? 'forward' : direction;
    const stepsNum = isRealtime ? 10 : Math.max(1, Math.min(100, Number(steps) || 10));

    const options = isRealtime ? {
      frontendPort: 3000,
      backendPort: 8000
    } : null;

    onAnalyze(url, isRealtime ? null : fnText, finalDirection, stepsNum, options);
  };

  return (
    <div className="repo-input-wrap">
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{
          fontSize: '18px',
          fontWeight: 600,
          color: 'white',
          marginBottom: '6px',
          fontFamily: 'Inter, sans-serif',
        }}>
          Analyze a Repository
        </h3>
        <p style={{
          fontSize: '13px',
          color: '#c4b5fd',
          fontFamily: 'Inter, sans-serif',
        }}>
          {isRealtime 
            ? 'Deploy repo and wait for real-time interaction to build graph.' 
            : 'Enter a GitHub URL and function name to trace.'}
        </p>
      </div>

      {/* Mode Toggle */}
      <div style={{ marginBottom: 18 }}>
        <label className="field-label">Analysis Mode</label>
        <div className="direction-toggle">
          <button
            type="button"
            className={`direction-option ${!isRealtime ? 'active' : ''}`}
            onClick={() => setIsRealtime(false)}
            style={{ fontSize: '12px' }}
          >
            Static (Function Name)
          </button>
          <button
            type="button"
            className={`direction-option ${isRealtime ? 'active' : ''}`}
            onClick={() => setIsRealtime(true)}
            style={{ fontSize: '12px' }}
          >
            Real-time (Interaction)
          </button>
        </div>
      </div>

      {/* Repo URL */}
      <label className="field-label">Repository URL</label>
      <div className="input-row">
        <input
          type="text"
          className="repo-input"
          placeholder="https://github.com/username/repository"
          value={url}
          onChange={e => { setUrl(e.target.value); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        />
      </div>

      {/* Static-only Fields */}
      {!isRealtime && (
        <>
          <label className="field-label" style={{ marginTop: 14 }}>
            Function / Action to Analyse
          </label>
          <div className="input-row">
            <input
              type="text"
              className="repo-input"
              placeholder="e.g. handleSubmit"
              value={fnText}
              onChange={e => { setFnText(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: 14, alignItems: 'stretch' }}>
            {/* Direction toggle */}
            <div style={{ flex: 1 }}>
              <label className="field-label">Flow Direction</label>
              <div className="direction-toggle">
                <button
                  type="button"
                  className={`direction-option ${direction === 'forward' ? 'active' : ''}`}
                  onClick={() => setDirection('forward')}
                >
                  Forward →
                </button>
                <button
                  type="button"
                  className={`direction-option ${direction === 'backward' ? 'active' : ''}`}
                  onClick={() => setDirection('backward')}
                >
                  ← Backward
                </button>
              </div>
            </div>

            {/* Steps input */}
            <div style={{ width: '120px', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
              <label className="field-label">Steps</label>
              <div className="input-row" style={{ flex: 1, display: 'flex', alignItems: 'stretch' }}>
                <input
                  type="text"
                  inputMode="numeric"
                  className="repo-input"
                  placeholder="10"
                  value={steps}
                  onChange={e => setSteps(e.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={() => {
                    const n = Math.max(1, Math.min(100, Number(steps) || 1));
                    setSteps(String(n));
                  }}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  style={{ textAlign: 'center', width: '100%' }}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {error && <p className="input-error">{error}</p>}

      <button
        className={`analyze-btn full-width ${loading ? 'loading' : ''}`}
        onClick={handleSubmit}
        disabled={loading}
        style={{ marginTop: 14 }}
      >
        {loading ? 'Preparing…' : isRealtime ? 'Start Real-time Session →' : 'Analyze Flow →'}
      </button>

      {loading && (
        <div className="parse-status">
          {['Parsing AST', 'Resolving imports', 'Tracing calls', 'Building graph'].map((t, i) => (
            <span key={i} style={{ animationDelay: `${i * 0.2}s` }} className="parse-token">
              {t}{i < 3 ? ' →' : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
