import { useState } from 'react';
import { Sparkles, Send } from 'lucide-react';

export default function SummaryView({ summary, typing, accentColor }) {
  const [chatText, setChatText] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setChatText('');
  };

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '20px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
    }}>
      {/* Purpose — uses typing animation */}
      <div style={{
        background: 'rgba(139,92,246,0.06)',
        border: '1px solid rgba(139,92,246,0.12)',
        borderRadius: 12,
        padding: '14px 16px',
      }}>
        <div style={{
          fontSize: 9,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: accentColor,
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          <Sparkles style={{ width: 11, height: 11 }} />
          Purpose
        </div>
        <div style={{
          fontSize: 13,
          color: '#e2e8f0',
          lineHeight: 1.6,
          fontFamily: "'Inter', sans-serif",
          fontWeight: 400,
        }}>
          {typing}
          <span style={{
            display: typing.length < summary.purpose.length ? 'inline-block' : 'none',
            width: 2,
            height: 14,
            background: accentColor,
            marginLeft: 1,
            animation: 'cursor-blink 0.8s step-end infinite',
            verticalAlign: 'text-bottom',
          }} />
        </div>
      </div>

      {/* Key Details */}
      {summary.details && summary.details.length > 0 && (
        <div>
          <div style={{
            fontSize: 9,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: '#64748b',
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            ▸ Key Details
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {summary.details.map((d, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                fontSize: 12,
                color: '#94a3b8',
                lineHeight: 1.5,
                fontFamily: "'Inter', sans-serif",
              }}>
                <span style={{
                  color: '#334155',
                  fontSize: 8,
                  marginTop: 5,
                  flexShrink: 0,
                }}>●</span>
                {d}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calls */}
      {summary.calls && summary.calls.length > 0 && (
        <div>
          <div style={{
            fontSize: 9,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: '#64748b',
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            ↗ Functions Called
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {summary.calls.map((c, i) => (
              <span key={i} style={{
                fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
                color: '#c4b5fd',
                background: 'rgba(139,92,246,0.08)',
                border: '1px solid rgba(139,92,246,0.15)',
                borderRadius: 6,
                padding: '3px 10px',
                fontWeight: 500,
              }}>
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Chat Box */}
      <form
        onSubmit={handleSubmit}
        style={{
          marginTop: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingTop: 10,
          borderTop: '1px solid rgba(139,92,246,0.12)',
        }}
      >
        <input
          value={chatText}
          onChange={(e) => setChatText(e.target.value)}
          placeholder="Ask about this summary..."
          style={{
            flex: 1,
            height: 36,
            borderRadius: 10,
            border: '1px solid rgba(139,92,246,0.2)',
            background: 'rgba(15,23,42,0.55)',
            color: '#e2e8f0',
            fontSize: 12,
            padding: '0 12px',
            outline: 'none',
            fontFamily: "'Inter', sans-serif",
          }}
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={!chatText.trim()}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            border: '1px solid rgba(139,92,246,0.25)',
            background: chatText.trim() ? 'rgba(139,92,246,0.2)' : 'rgba(51,65,85,0.45)',
            color: chatText.trim() ? '#c4b5fd' : '#64748b',
            display: 'grid',
            placeItems: 'center',
            cursor: chatText.trim() ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s ease',
          }}
        >
          <Send style={{ width: 14, height: 14 }} />
        </button>
      </form>


      <style>{`
        @keyframes cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
