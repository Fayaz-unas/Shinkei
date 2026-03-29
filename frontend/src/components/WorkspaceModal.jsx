import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { MeshGradient } from '@paper-design/shaders-react';
import RepoInput from './RepoInput';

export default function WorkspaceModal({ isOpen, onClose, onAnalyze, loading }) {
  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
          <motion.div
            layoutId="cta-card"
            transition={{ type: 'spring', bounce: 0, duration: 0.45 }}
            style={{ borderRadius: '24px', background: '#1a1035' }}
            layout
            className="relative flex h-full w-full overflow-hidden sm:rounded-[24px] shadow-2xl"
          >
            {/* MeshGradient Background */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 pointer-events-none"
            >
              <MeshGradient
                speed={0.6}
                colors={["#2e1065", "#1e1b4b", "#0f0a2a", "#1a0f3a"]}
                distortion={0.8}
                swirl={0.1}
                grainMixer={0.15}
                grainOverlay={0}
                style={{ height: '100%', width: '100%' }}
              />
            </motion.div>

            {/* Close Button */}
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={onClose}
              className="absolute right-4 top-4 sm:right-8 sm:top-8 z-50 flex h-10 w-10 items-center justify-center rounded-full cursor-pointer"
              style={{
                background: 'rgba(255,255,255,0.08)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'white',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            >
              <X className="h-5 w-5" />
            </motion.button>

            {/* Modal Content */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="relative z-10 flex items-center justify-center h-full w-full overflow-y-auto"
            >
              {/* Centered Form */}
              <div className="workspace-form-card" style={{ margin: '24px' }}>
                <RepoInput onAnalyze={onAnalyze} loading={loading} analyzed={false} />
              </div>
            </motion.div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
