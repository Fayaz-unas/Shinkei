import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Save, Code2, Monitor, MousePointer2, RefreshCcw, Check, AlertCircle, Search, Zap, Hash } from 'lucide-react';
import { highlight } from '../utils/SyntaxHighlight';
import { API_BASE_URL } from '../config';

export default function UIEditorView({ 
  isOpen, 
  appUrl, 
  onClose,
  repoRoot,
  isAppReady 
}) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error' | null
  const [line, setLine] = useState(null);
  const [snippetStartLine, setSnippetStartLine] = useState(1); // 👈 Track where snippet starts
  const [activeRange, setActiveRange] = useState(null); // 👈 Store snippet boundaries
  const [isInspectMode, setIsInspectMode] = useState(false);
  const [showReadyToast, setShowReadyToast] = useState(false);
  const [scrollTop, setScrollTop] = useState(0); // 👈 Track scroll position
  const [scrollLeft, setScrollLeft] = useState(0);
  const [editorWidth, setEditorWidth] = useState(500);
  const [isResizing, setIsResizing] = useState(false);
  const iframeRef = useRef(null);
  const textareaRef = useRef(null);
  const pendingWidthRef = useRef(500);
  const resizeRafRef = useRef(null);

  const handleScroll = (e) => {
    setScrollTop(e.target.scrollTop);
    setScrollLeft(e.target.scrollLeft);
  };

  const codeLines = fileContent.split('\n');
  const currentFileName = selectedFile ? selectedFile.split(/[/\\]/).pop() : '';

  useEffect(() => {
    const MIN_EDITOR_WIDTH = 360;
    const MIN_IFRAME_WIDTH = 320;

    const handleMouseMove = (event) => {
      if (!isResizing) return;
      const nextWidth = window.innerWidth - event.clientX;
      const maxEditorWidth = Math.max(MIN_EDITOR_WIDTH, window.innerWidth - MIN_IFRAME_WIDTH);
      const clampedWidth = Math.max(MIN_EDITOR_WIDTH, Math.min(maxEditorWidth, nextWidth));
      pendingWidthRef.current = clampedWidth;

      if (resizeRafRef.current === null) {
        resizeRafRef.current = window.requestAnimationFrame(() => {
          setEditorWidth(pendingWidthRef.current);
          resizeRafRef.current = null;
        });
      }
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setEditorWidth(pendingWidthRef.current);
        setIsResizing(false);
      }
    };

    const handleWindowBlur = () => {
      if (isResizing) {
        setEditorWidth(pendingWidthRef.current);
        setIsResizing(false);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('blur', handleWindowBlur);
    if (isResizing) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('blur', handleWindowBlur);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      if (resizeRafRef.current !== null) {
        window.cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
    };
  }, [isResizing]);

  // ── Relative line for highlight ──
  const relativeLine = line - snippetStartLine + 1;
  const activeLineIndex = line ? Math.max(0, relativeLine - 1) : -1;

  // ── Auto-scroll to selected line ──
  useEffect(() => {
    if (textareaRef.current && line) {
      const lineHeight = 1.6 * 13;
      const scrollLine = relativeLine;
      const scrollTop = (scrollLine - 1) * lineHeight;
      textareaRef.current.scrollTo({ top: Math.max(0, scrollTop - 100), behavior: 'smooth' });
      textareaRef.current.focus();
    }
  }, [line, fileContent, relativeLine]);

  useEffect(() => {
    if (isAppReady && isOpen) {
      setShowReadyToast(true);
      const timer = setTimeout(() => setShowReadyToast(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [isAppReady, isOpen]);

  // ── Listen for SHINKEI_CLICK from Iframe ──
  useEffect(() => {
    const handleMessage = (event) => {
      console.log('📬 [Shinkei-Parent] Message from Iframe:', event.data);
      if (event.data?.type === 'SHINKEI_CLICK') {
        const { file, line } = event.data;
        console.log('🎯 UI Click detected:', file, 'line:', line);
        handleFileSelect(file, line);
        setIsInspectMode(false); // Auto-turn off on click
      }
      if (event.data?.type === 'SHINKEI_INSPECTOR_DISABLED') {
        setIsInspectMode(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const toggleInspector = () => {
    const nextState = !isInspectMode;
    setIsInspectMode(nextState);
    if (iframeRef.current) {
      iframeRef.current.contentWindow.postMessage({
        type: 'SHINKEI_INSPECTOR_MODE',
        enabled: nextState
      }, '*');
    }
  };

  const handleFileSelect = async (filePath, lineNum) => {
    const parsedLine = Number.parseInt(lineNum, 10);
    const hasValidLine = Number.isFinite(parsedLine) && parsedLine > 0;
    setLoading(true);
    setSelectedFile(filePath);
    setLine(hasValidLine ? parsedLine : null);
    try {
      // 🎯 Request specific line to get design snippet
      const url = `${API_BASE_URL}/api/editor/read?file=${encodeURIComponent(filePath)}${hasValidLine ? `&line=${parsedLine}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Read failed with status ${res.status}`);
      }
      const data = await res.json();
      if (data.success) {
        const nextContent = typeof data.content === 'string' ? data.content : '';
        setFileContent(nextContent);
        setOriginalContent(nextContent);
        setActiveRange(data.range || null);
        setSnippetStartLine(data.snippetStartLine || 1); // 👈 Save the offset
      } else {
        throw new Error(data.error || 'Failed to read file content');
      }
    } catch (err) {
      console.error('Failed to read file:', err);
      setFileContent('');
      setOriginalContent('');
      setActiveRange(null);
      setSnippetStartLine(1);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedFile || saving) return;
    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/editor/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: selectedFile,
          newCode: fileContent,
          repoRoot: repoRoot,
          range: activeRange // 👈 Surgical update!
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus('success');
        setOriginalContent(fileContent);
        // Refresh iframe to see changes
        if (iframeRef.current) {
          iframeRef.current.src = iframeRef.current.src;
        }
      } else {
        setSaveStatus('error');
      }
    } catch (err) {
      setSaveStatus('error');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  if (!isOpen) return null;

  const isDirty = fileContent !== originalContent;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: '#07070a' }}
    >
      {/* ── Top Bar ── */}
      <div style={{
        height: '60px',
        background: 'rgba(7,7,10,0.8)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(139,92,246,0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            <ArrowLeft style={{ width: 18, height: 18 }} />
            Exit
          </button>
          <div style={{ height: '20px', width: '1px', background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={toggleInspector}
              disabled={!isAppReady}
              style={{
                background: isInspectMode ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isInspectMode ? '#7c3aed' : 'rgba(255,255,255,0.1)'}`,
                color: isInspectMode ? '#c4b5fd' : '#94a3b8',
                borderRadius: '8px',
                padding: '6px 14px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: isAppReady ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s',
                opacity: isAppReady ? 1 : 0.5,
                boxShadow: isInspectMode ? '0 0 15px rgba(124,58,237,0.15)' : 'none',
              }}
            >
              <Search style={{ width: 14, height: 14 }} />
              Inspect
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            fontSize: '11px',
            color: isAppReady ? '#22c993' : '#64748b',
            background: isAppReady ? 'rgba(34,201,147,0.05)' : 'rgba(255,255,255,0.02)',
            padding: '4px 12px',
            borderRadius: '100px',
            border: `1px solid ${isAppReady ? 'rgba(34,201,147,0.2)' : 'rgba(255,255,255,0.05)'}`,
            fontFamily: 'monospace',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <div style={{ 
              width: 6, height: 6, borderRadius: '50%', 
              background: isAppReady ? '#22c993' : '#475569',
              animation: isAppReady ? 'sk-pulse 2s infinite' : 'none'
            }} />
            {isAppReady ? (isInspectMode ? 'SELECT MODE ACTIVE' : 'EDITOR READY') : 'INITIALIZING...'}
          </div>
          
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            style={{
              background: isDirty ? 'linear-gradient(135deg, #7c3aed, #6366f1)' : 'rgba(255,255,255,0.05)',
              border: 'none',
              borderRadius: '8px',
              color: isDirty ? '#fff' : '#475569',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: isDirty ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s',
            }}
          >
            {saving ? <RefreshCcw style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> : <Save style={{ width: 14, height: 14 }} />}
            {saveStatus === 'success' ? 'Saved!' : 'Sync Changes'}
          </button>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        
        {/* Iframe Panel */}
        <div style={{ flex: 1, position: 'relative', background: '#fff' }}>
          {!isAppReady && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 5,
              background: '#07070a', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '20px'
            }}>
              <RefreshCcw style={{ width: 32, height: 32, color: '#7c3aed', animation: 'spin 2s linear infinite' }} />
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: '#f1f5f9', fontWeight: 600, margin: 0 }}>Starting environment...</p>
                <p style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>This may take a few seconds depending on the project size.</p>
              </div>
            </div>
          )}
          <iframe
            ref={iframeRef}
            src={appUrl}
            style={{ width: '100%', height: '100%', border: 'none', pointerEvents: isResizing ? 'none' : 'auto' }}
            title="Target Website"
          />
        </div>

        {/* Editor Panel */}
        <AnimatePresence>
          {selectedFile && (
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              style={{
                width: `${editorWidth}px`,
                background: 'linear-gradient(180deg, rgba(17,12,34,0.78) 0%, rgba(13,10,28,0.72) 100%)',
                backdropFilter: 'blur(14px) saturate(1.2)',
                WebkitBackdropFilter: 'blur(14px) saturate(1.2)',
                borderLeft: '1px solid rgba(139,92,246,0.16)',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '-20px 0 40px rgba(0,0,0,0.5)',
                fontFamily: "'JetBrains Mono', monospace",
                position: 'relative',
              }}
            >
              <div
                onMouseDown={() => {
                  pendingWidthRef.current = editorWidth;
                  setIsResizing(true);
                }}
                style={{
                  position: 'absolute',
                  left: -4,
                  top: 0,
                  bottom: 0,
                  width: 8,
                  cursor: 'col-resize',
                  zIndex: 20,
                  background: isResizing ? 'rgba(124,58,237,0.25)' : 'transparent',
                }}
                title="Drag to resize"
              />

              <div style={{
                padding: '18px 18px 14px',
                borderBottom: '1px solid rgba(139,92,246,0.08)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                background: 'rgba(26,16,53,0.4)',
                position: 'relative',
              }}>
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: '10%',
                  right: '10%',
                  height: '1px',
                  background: 'linear-gradient(90deg, transparent, rgba(124,58,237,0.35), transparent)',
                }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      onClick={() => setSelectedFile(null)}
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
                      <ArrowLeft style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#64748b', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                  <Code2 style={{ width: 13, height: 13, color: '#a78bfa', opacity: 0.7 }} />
                  <span style={{ color: '#94a3b8' }}>{currentFileName}</span>
                  <span style={{ color: '#334155' }}>·</span>
                  <span style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Hash style={{ width: 10, height: 10, opacity: 0.6 }} />
                    {line ?? '—'}
                  </span>
                </div>
              </div>

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
                <Code2 style={{ width: 13, height: 13, color: '#a78bfa', opacity: 0.8 }} />
                <span style={{ color: '#94a3b8' }}>{selectedFile}</span>
                <span style={{ color: '#334155' }}>·</span>
                <span style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Hash style={{ width: 10, height: 10, opacity: 0.6 }} />
                  {line ?? '—'}
                </span>
              </div>

              <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                {loading ? (
                  <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
                    <RefreshCcw style={{ width: 24, height: 24, color: '#7c3aed', animation: 'spin 1s linear infinite' }} />
                  </div>
                ) : (
                  <div style={{ height: '100%', position: 'relative', overflow: 'hidden', background: 'rgba(12,10,24,0.18)' }}>
                    <div style={{ minWidth: 'max-content', height: '100%', overflow: 'hidden' }}>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '44px minmax(0, 1fr)',
                        alignItems: 'stretch',
                        minHeight: '100%',
                        background: 'rgba(12,10,24,0.18)',
                      }}>
                        <div style={{
                          fontSize: 11,
                          color: '#475569',
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
                          overflow: 'hidden',
                        }}>
                          <div style={{ transform: `translateY(-${scrollTop}px)` }}>
                            {codeLines.map((_, index) => (
                              <div
                                key={index}
                                style={{
                                  height: '1.7em',
                                  color: index === activeLineIndex ? '#c4b5fd' : '#475569',
                                  background: index === activeLineIndex ? 'rgba(124,58,237,0.14)' : 'transparent',
                                  borderRight: index === activeLineIndex ? '2px solid rgba(124,58,237,0.65)' : '2px solid transparent',
                                  transition: 'background 0.12s, color 0.12s',
                                }}
                              >
                                {snippetStartLine + index}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div style={{ position: 'relative', minHeight: '100%', height: '100%' }}>
                          <div style={{
                            position: 'absolute',
                            inset: 0,
                            padding: '0 20px 0 18px',
                            color: '#e2e8f0',
                            fontSize: '13px',
                            lineHeight: '1.7',
                            fontFamily: '"JetBrains Mono", monospace',
                            pointerEvents: 'none',
                            whiteSpace: 'pre',
                            overflow: 'visible',
                            transform: `translate(${-scrollLeft}px, ${-scrollTop}px)`,
                            minWidth: 'max-content',
                          }}>
                            {codeLines.map((lineText, index) => (
                              <div
                                key={index}
                                style={{
                                  height: '1.7em',
                                  width: 'max-content',
                                  background: index === activeLineIndex ? 'rgba(124,58,237,0.22)' : 'transparent',
                                  borderLeft: index === activeLineIndex ? '3px solid #7c3aed' : '3px solid transparent',
                                  paddingLeft: index === activeLineIndex ? 6 : 0,
                                  transition: 'background 0.12s',
                                }}
                              >
                                {highlight(lineText)}
                              </div>
                            ))}
                          </div>
                          <textarea
                            ref={textareaRef}
                            value={fileContent}
                            onChange={(e) => setFileContent(e.target.value)}
                            onScroll={handleScroll}
                            spellCheck={false}
                            wrap="off"
                            style={{
                              width: '100%',
                              height: '100%',
                              background: 'transparent',
                              color: 'transparent',
                              border: 'none',
                              outline: 'none',
                              padding: '0 20px 0 18px',
                              fontFamily: '"JetBrains Mono", monospace',
                              fontSize: '13px',
                              lineHeight: '1.7',
                              resize: 'none',
                              position: 'relative',
                              zIndex: 1,
                              caretColor: '#7c3aed',
                              whiteSpace: 'pre',
                              overflow: 'auto',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {saveStatus && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  style={{
                    position: 'absolute',
                    bottom: '20px',
                    right: '20px',
                    padding: '12px 20px',
                    borderRadius: '10px',
                    background: saveStatus === 'success' ? 'rgba(16,185,129,0.9)' : 'rgba(239,68,68,0.9)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '14px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                    zIndex: 100,
                  }}
                >
                  {saveStatus === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
                  {saveStatus === 'success' ? 'Changes synced successfully' : 'Failed to save changes'}
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Ready Toast */}
        <AnimatePresence>
          {showReadyToast && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              style={{
                position: 'absolute', bottom: '30px', left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(124,58,237,0.95)', color: '#fff', padding: '12px 24px',
                borderRadius: '100px', boxShadow: '0 10px 40px rgba(124,58,237,0.4)',
                display: 'flex', alignItems: 'center', gap: '12px', zIndex: 1000,
                backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.2)'
              }}
            >
              <Zap size={18} fill="currentColor" />
              <span style={{ fontWeight: 600, fontSize: '14px' }}>Editor Ready! You can now use the Inspect tool.</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes sk-pulse {
          0% { transform: scale(0.95); opacity: 0.5; }
          50% { transform: scale(1); opacity: 1; }
          100% { transform: scale(0.95); opacity: 0.5; }
        }
      `}</style>
    </motion.div>
  );
}
