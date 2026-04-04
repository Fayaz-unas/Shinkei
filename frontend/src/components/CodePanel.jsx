// CodePanel.jsx — Code viewer + AI summary panel for graph nodes
import { X, FileCode2, Copy, Check, Sparkles, Code2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { TYPE_COLOR, TYPE_LABEL } from '../constants/nodeTypes';
import { highlight } from '../utils/syntaxHighlight';
import { useTypingAnimation } from '../hooks/useTypingAnimation';
import SummaryView from './SummaryView';

export default function CodePanel({ node, onClose }) {
  const [copied, setCopied] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summarising, setSummarising] = useState(false);
  const t = TYPE_COLOR[node.type] || '#8B7FE8';
  const tLabel = TYPE_LABEL[node.type] || 'Function';
  const code = node.code || '// No source code available for this node.';
  const lines = code.split('\n');
  const [summary, setSummary] = useState(null);

  const typingText = useTypingAnimation(summary?.purpose ?? '', 14, summarising || showSummary);

  // Reset summary when node changes
  useEffect(() => {
    setShowSummary(false);
    setSummarising(false);
    setSummary(null);
  }, [node.label]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSummarise = async () => {
    if (showSummary) {
      setShowSummary(false);
      setSummarising(false);
      return;
    }
    if (!node.code) return;
    setSummarising(true);
    try {
      const res = await fetch(`http://${window.location.hostname}:5000/api/explain-function`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: node.code, label: node.label }),
      });
      const data = await res.json();
      if (data.success) {
        setSummary({
          purpose: data.explanation.explanation,
          details: data.explanation.steps ?? [],
          calls: [],
        });
        setShowSummary(true);
      }
    } catch (err) {
      console.error('Summarise failed:', err);
    } finally {
      setSummarising(false);
    }
  };

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(15,10,30,0.97)',
      fontFamily: "'JetBrains Mono', monospace",
    }}>

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        padding: '16px 18px 14px',
        borderBottom: '1px solid rgba(139,92,246,0.1)',
        flexShrink: 0,
        background: 'rgba(26,16,53,0.4)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {/* Type badge */}
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 9,
            fontWeight: 700,
            color: t,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            background: t + '15',
            padding: '2px 8px',
            borderRadius: 4,
            border: `1px solid ${t}25`,
            width: 'fit-content',
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: t, display: 'inline-block',
            }} />
            {tLabel}
          </span>

          {/* Function name */}
          <span style={{
            fontSize: 14,
            color: '#f1f5f9',
            fontWeight: 600,
            letterSpacing: '-0.01em',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {node.label}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Copy button */}
          <button
            onClick={handleCopy}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(71,85,105,0.2)',
              borderRadius: 7,
              color: copied ? '#22c993' : '#475569',
              cursor: 'pointer',
              padding: '5px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              transition: 'all 0.2s',
              fontFamily: "'JetBrains Mono', monospace",
            }}
            onMouseEnter={e => {
              if (!copied) e.currentTarget.style.color = '#94a3b8';
              e.currentTarget.style.borderColor = 'rgba(71,85,105,0.4)';
            }}
            onMouseLeave={e => {
              if (!copied) e.currentTarget.style.color = '#475569';
              e.currentTarget.style.borderColor = 'rgba(71,85,105,0.2)';
            }}
          >
            {copied ? <Check style={{ width: 12, height: 12 }} /> : <Copy style={{ width: 12, height: 12 }} />}
            {copied ? 'Copied' : 'Copy'}
          </button>

          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(71,85,105,0.2)',
              borderRadius: 7,
              color: '#475569',
              cursor: 'pointer',
              padding: '5px 7px',
              display: 'flex',
              alignItems: 'center',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = '#94a3b8';
              e.currentTarget.style.borderColor = 'rgba(71,85,105,0.4)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = '#475569';
              e.currentTarget.style.borderColor = 'rgba(71,85,105,0.2)';
            }}
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </div>

      {/* File path bar */}
      <div style={{
        padding: '8px 18px',
        background: 'rgba(26,16,53,0.5)',
        borderBottom: '1px solid rgba(139,92,246,0.08)',
        fontSize: 11,
        color: '#64748b',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <FileCode2 style={{ width: 13, height: 13, color: t, opacity: 0.7 }} />
        <span style={{ color: '#94a3b8' }}>{node.file}</span>
        <span style={{ color: '#334155' }}>·</span>
        <span style={{ color: '#475569' }}>line {node.startLine ?? node.line ?? '—'}</span>
      </div>

      {/* ── Summarise action bar ── */}
      <button
        onClick={handleSummarise}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          width: '100%',
          padding: showSummary ? '10px 18px' : '12px 18px',
          border: 'none',
          borderBottom: '1px solid rgba(71,85,105,0.1)',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'all 0.3s ease',
          fontFamily: "'Inter', sans-serif",
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '0.01em',
          position: 'relative',
          overflow: 'hidden',
          ...(showSummary ? {
            background: 'rgba(15,23,42,0.5)',
            color: '#94a3b8',
          } : summarising ? {
            background: 'linear-gradient(135deg, rgba(109,40,217,0.2) 0%, rgba(79,70,229,0.15) 100%)',
            color: '#c4b5fd',
          } : {
            background: 'linear-gradient(135deg, rgba(109,40,217,0.12) 0%, rgba(79,70,229,0.08) 100%)',
            color: '#c4b5fd',
          }),
        }}
        onMouseEnter={e => {
          if (!showSummary && !summarising) {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(109,40,217,0.2) 0%, rgba(79,70,229,0.15) 100%)';
          }
          if (showSummary) {
            e.currentTarget.style.background = 'rgba(15,23,42,0.7)';
            e.currentTarget.style.color = '#c4b5fd';
          }
        }}
        onMouseLeave={e => {
          if (!showSummary && !summarising) {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(109,40,217,0.12) 0%, rgba(79,70,229,0.08) 100%)';
          }
          if (showSummary) {
            e.currentTarget.style.background = 'rgba(15,23,42,0.5)';
            e.currentTarget.style.color = '#94a3b8';
          }
        }}
      >
        {/* Shimmer effect when not active */}
        {!showSummary && !summarising && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: '-100%',
            width: '100%',
            height: '100%',
            background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.08), transparent)',
            animation: 'shimmer 3s ease-in-out infinite',
            pointerEvents: 'none',
          }} />
        )}

        {summarising ? (
          <span style={{
            width: 16, height: 16,
            border: '2px solid rgba(139,92,246,0.3)',
            borderTopColor: '#c4b5fd',
            borderRadius: '50%',
            display: 'inline-block',
            animation: 'summarise-spin 0.6s linear infinite',
          }} />
        ) : showSummary ? (
          <Code2 style={{ width: 15, height: 15 }} />
        ) : (
          <Sparkles style={{ width: 15, height: 15, animation: 'sparkle-pulse 2s ease-in-out infinite' }} />
        )}
        {summarising ? 'Analysing code…' : showSummary ? 'Back to Code' : 'Summarise'}
      </button>

      {/* Content area: code or summary */}
      {showSummary ? (
        <SummaryView summary={summary} typing={typingText} accentColor={t} />
      ) : (
        <div style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
        }}>
          {/* Line numbers */}
          <div style={{
            padding: '16px 0',
            minWidth: 44,
            background: 'rgba(26,16,53,0.4)',
            borderRight: '1px solid rgba(139,92,246,0.08)',
            textAlign: 'right',
            userSelect: 'none',
            flexShrink: 0,
          }}>
            {lines.map((_, i) => (
              <div key={i} style={{
                fontSize: 11,
                color: '#475569',
                lineHeight: '1.7',
                paddingRight: 12,
                paddingLeft: 8,
                transition: 'color 0.15s',
              }}>
                {(node.startLine ?? node.line ?? 1) + i}
              </div>
            ))}
          </div>

          {/* Code */}
          <pre style={{
            margin: 0,
            padding: '16px 20px',
            fontSize: 13,
            lineHeight: '1.7',
            overflowX: 'auto',
            flex: 1,
            whiteSpace: 'pre',
            color: '#e2e8f0',
          }}>
            {highlight(code)}
          </pre>
        </div>
      )}

      {/* Footer */}
      <div style={{
        padding: '8px 18px',
        borderTop: '1px solid rgba(139,92,246,0.08)',
        fontSize: 11,
        color: '#475569',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'rgba(26,16,53,0.3)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: '#64748b' }}>{showSummary ? 'Summary' : `${lines.length} lines`}</span>
        </span>
        <span style={{
          width: 4, height: 4, borderRadius: '50%',
          background: '#334155', display: 'inline-block',
        }} />
        <span style={{ color: t, opacity: 0.85 }}>{tLabel}</span>
        <span style={{
          width: 4, height: 4, borderRadius: '50%',
          background: '#334155', display: 'inline-block',
        }} />
        <span style={{ color: '#475569', fontStyle: 'italic' }}>
          {node.endLine ? `lines ${node.startLine ?? node.line}–${node.endLine}` : 'live'}
        </span>
      </div>

      <style>{`
        @keyframes summarise-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes shimmer {
          0% { left: -100%; }
          50% { left: 100%; }
          100% { left: 100%; }
        }
        @keyframes sparkle-pulse {
          0%, 100% { opacity: 0.8; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }
      `}</style>
    </div>
  );
}