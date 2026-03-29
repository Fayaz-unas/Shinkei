import { useState } from 'react';

export default function RepoInput({ onAnalyze, loading, analyzed }) {
  const [url, setUrl]             = useState('');
  const [fnText, setFnText]       = useState('');
  const [direction, setDirection] = useState('forward');
  const [steps, setSteps]         = useState(10);
  const [error, setError]         = useState('');
  const [started, setStarted]     = useState(false);

  const submit = (urlVal, fnVal, key) => {
    if (!urlVal.trim()) { setError('Please enter a GitHub repository URL.'); return; }
    if (!fnVal.trim())  { setError('Please enter a function or action to analyse.'); return; }
    setError('');
    onAnalyze(urlVal, fnVal, key);
  };

  const handleAnalyzeClick = () => {
    if (!started) {
      if (!url.trim()) { 
        setError('Please enter a GitHub repository URL.'); 
        return; 
      }
      setError('');
      setStarted(true);
    } else {
      submit(url, fnText);
    }
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
          Enter a GitHub URL and function name to trace.
        </p>
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
          onKeyDown={e => e.key === 'Enter' && handleAnalyzeClick()}
        />
      </div>

      {started && (
        <>
          {/* Function / action */}
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
              onKeyDown={e => e.key === 'Enter' && handleAnalyzeClick()}
            />
          </div>

          {/* Direction + Steps row */}
          <div style={{ display: 'flex', gap: '12px', marginTop: 14 }}>
            {/* Direction toggle */}
            <div style={{ flex: 1 }}>
              <label className="field-label">Direction</label>
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
            <div style={{ width: '120px', flexShrink: 0 }}>
              <label className="field-label">Steps</label>
              <div className="input-row">
                <input
                  type="number"
                  className="repo-input"
                  placeholder="10"
                  min={1}
                  max={100}
                  value={steps}
                  onChange={e => setSteps(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                  onKeyDown={e => e.key === 'Enter' && handleAnalyzeClick()}
                  style={{ textAlign: 'center' }}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {error && <p className="input-error">{error}</p>}

      <button
        className={`analyze-btn full-width ${loading ? 'loading' : ''}`}
        onClick={handleAnalyzeClick}
        disabled={loading}
        style={{ marginTop: 14 }}
      >
        {loading ? 'Parsing…' : (started ? 'Analyze Flow →' : 'Next')}
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
