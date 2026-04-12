// CodePanel.jsx — Code viewer + AI summary panel for graph nodes
import { X, FileCode2, Copy, Check, Sparkles, Code2, Hash } from 'lucide-react';
import { useState, useEffect } from 'react';
import { TYPE_COLOR, TYPE_LABEL } from '../constants/nodeTypes';
import { highlight } from '../utils/SyntaxHighlight';
import { useTypingAnimation } from '../hooks/useTypingAnimation';
import SummaryView from './SummaryView';

export default function CodePanel({ node, onClose }) {
  const [copied, setCopied] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summarising, setSummarising] = useState(false);
  const [hoveredLine, setHoveredLine] = useState(-1);
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
  }, [node.id, node.label]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSummarise = async () => {
    if (summarising) {
      return;
    }

    if (showSummary) {
      setShowSummary(false);
      setSummarising(false);
      return;
    }

    if (!node.code || !node.code.trim()) {
      setSummary({
        purpose: 'No source code is available for this node, so summary could not be generated.',
        details: [],
        calls: [],
      });
      setShowSummary(true);
      return;
    }

    setSummary({
      purpose: 'Generating summary…',
      details: [],
      calls: [],
    });
    setShowSummary(true);
    setSummarising(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/explain-function`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: node.code, label: node.label }),
      });

      const data = await res.json();

      if (!res.ok || !data?.success) {
        setSummary({
          purpose: data?.error || 'Failed to generate summary for this node.',
          details: [],
          calls: [],
        });
        setShowSummary(true);
        return;
      }

      // Handle different response shapes — API may return explanation as string or object
      const explanation = data.explanation;
      const purposeText = typeof explanation === 'string'
        ? explanation
        : typeof explanation?.explanation === 'string'
          ? explanation.explanation
          : typeof explanation?.purpose === 'string'
            ? explanation.purpose
            : 'Summary unavailable.';

      const steps = Array.isArray(explanation?.steps)
        ? explanation.steps
        : Array.isArray(explanation?.details)
          ? explanation.details
          : [];

      setSummary({
        purpose: purposeText,
        details: steps,
        calls: Array.isArray(explanation?.calls) ? explanation.calls : [],
      });
    } catch (err) {
      console.error('Summarise failed:', err);
      setSummary({
        purpose: 'Unable to reach summarization service. Please try again.',
        details: [],
        calls: [],
      });
    } finally {
      setSummarising(false);
    }
  };

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'linear-gradient(180deg, rgba(17,12,34,0.78) 0%, rgba(13,10,28,0.72) 100%)',
      backdropFilter: 'blur(14px) saturate(1.2)',
      WebkitBackdropFilter: 'blur(14px) saturate(1.2)',
      fontFamily: "'JetBrains Mono', monospace",
    }}>

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        padding: '18px 18px 14px',
        borderBottom: '1px solid rgba(139,92,246,0.08)',
        flexShrink: 0,
        background: 'rgba(26,16,53,0.4)',
        position: 'relative',
      }}>
        {/* Top accent */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: '10%',
          right: '10%',
          height: '1px',
          background: `linear-gradient(90deg, transparent, ${t}40, transparent)`,
        }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
            background: t + '12',
            padding: '3px 9px',
            borderRadius: 6,
            border: `1px solid ${t}20`,
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
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(71,85,105,0.15)',
              borderRadius: 8,
              color: copied ? '#22c993' : '#475569',
              cursor: 'pointer',
              padding: '6px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              transition: 'all 0.25s cubic-bezier(0.22,1,0.36,1)',
              fontFamily: "'JetBrains Mono', monospace",
            }}
            onMouseEnter={e => {
              if (!copied) e.currentTarget.style.color = '#94a3b8';
              e.currentTarget.style.borderColor = 'rgba(71,85,105,0.3)';
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
            }}
            onMouseLeave={e => {
              if (!copied) e.currentTarget.style.color = '#475569';
              e.currentTarget.style.borderColor = 'rgba(71,85,105,0.15)';
              e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
            }}
          >
            {copied ? <Check style={{ width: 12, height: 12 }} /> : <Copy style={{ width: 12, height: 12 }} />}
            {copied ? 'Copied' : 'Copy'}
          </button>

          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(71,85,105,0.15)',
              borderRadius: 8,
              color: '#475569',
              cursor: 'pointer',
              padding: '6px 8px',
              display: 'flex',
              alignItems: 'center',
              transition: 'all 0.25s cubic-bezier(0.22,1,0.36,1)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = '#f87171';
              e.currentTarget.style.borderColor = 'rgba(248,113,113,0.2)';
              e.currentTarget.style.background = 'rgba(248,113,113,0.06)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = '#475569';
              e.currentTarget.style.borderColor = 'rgba(71,85,105,0.15)';
              e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
            }}
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </div>

      {/* File path bar */}
      <div style={{
        padding: '9px 18px',
        background: 'rgba(26,16,53,0.35)',
        borderBottom: '1px solid rgba(139,92,246,0.06)',
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
        <span style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: 3 }}>
          <Hash style={{ width: 10, height: 10, opacity: 0.6 }} />
          {node.startLine ?? node.line ?? '—'}
        </span>
      </div>

      {/* ── Summarise action bar ── */}
      <button
        onClick={handleSummarise}
        disabled={summarising}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          width: '100%',
          padding: showSummary ? '10px 18px' : '12px 18px',
          border: 'none',
          borderBottom: '1px solid rgba(71,85,105,0.08)',
          cursor: summarising ? 'wait' : 'pointer',
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
            background: 'linear-gradient(135deg, rgba(109,40,217,0.1) 0%, rgba(79,70,229,0.06) 100%)',
            color: '#c4b5fd',
          }),
        }}
        onMouseEnter={e => {
          if (summarising) return;
          if (!showSummary && !summarising) {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(109,40,217,0.18) 0%, rgba(79,70,229,0.12) 100%)';
          }
          if (showSummary) {
            e.currentTarget.style.background = 'rgba(15,23,42,0.7)';
            e.currentTarget.style.color = '#c4b5fd';
          }
        }}
        onMouseLeave={e => {
          if (summarising) return;
          if (!showSummary && !summarising) {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(109,40,217,0.1) 0%, rgba(79,70,229,0.06) 100%)';
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
            background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.06), transparent)',
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
        <SummaryView
          summary={summary}
          typing={typingText}
          accentColor={t}
          code={node.code || ''}
          label={node.label || ''}
        />
      ) : (
        <div style={{
          flex: 1,
          overflow: 'auto',
          background: 'rgba(12,10,24,0.18)',
        }}>
          <div style={{ minWidth: 'max-content', minHeight: '100%' }}>
            {lines.map((line, i) => (
              <div
                key={i}
                onMouseEnter={() => setHoveredLine(i)}
                onMouseLeave={() => setHoveredLine(-1)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '44px minmax(0, 1fr)',
                  alignItems: 'start',
                  background: hoveredLine === i ? 'rgba(139,92,246,0.06)' : 'transparent',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{
                  fontSize: 11,
                  color: hoveredLine === i ? '#a78bfa' : '#475569',
                  lineHeight: '1.7',
                  paddingRight: 12,
                  paddingLeft: 8,
                  userSelect: 'none',
                  textAlign: 'right',
                  position: 'sticky',
                  left: 0,
                  zIndex: 1,
                  background: 'rgba(26,16,53,0.3)',
                  borderRight: '1px solid rgba(139,92,246,0.06)',
                  transition: 'color 0.15s',
                }}>
                  {(node.startLine ?? node.line ?? 1) + i}
                </div>

                <pre style={{
                  margin: 0,
                  fontSize: 13,
                  lineHeight: '1.7',
                  whiteSpace: 'pre',
                  color: '#e2e8f0',
                  padding: '0 20px 0 18px',
                  borderLeft: hoveredLine === i ? `2px solid ${t}50` : '2px solid transparent',
                }}>
                  {highlight(line)}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{
        padding: '9px 18px',
        borderTop: '1px solid rgba(139,92,246,0.06)',
        fontSize: 11,
        color: '#475569',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'rgba(26,16,53,0.25)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: '#64748b' }}>{showSummary ? 'AI Summary' : `${lines.length} lines`}</span>
        </span>
        <span style={{
          width: 3, height: 3, borderRadius: '50%',
          background: '#334155', display: 'inline-block',
        }} />
        <span style={{ color: t, opacity: 0.85 }}>{tLabel}</span>
        <span style={{
          width: 3, height: 3, borderRadius: '50%',
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