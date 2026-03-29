import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { GodRays } from '@paper-design/shaders-react';

export default function HeroView({ isActive, onOpenWorkspace }) {
  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 sm:px-6 py-12 sm:py-20"
      style={{ background: '#09090b' }}
    >
      {/* GodRays Background */}
      <div className="absolute inset-0 pointer-events-none">
        <GodRays
          colorBack="#00000000"
          colors={["#7c3aed40", "#6366f140", "#4c1d9540", "#0ea5e940"]}
          colorBloom="#7c3aed"
          offsetX={0.85}
          offsetY={-1}
          intensity={0.5}
          spotty={0.45}
          midSize={10}
          midIntensity={0}
          density={0.38}
          bloom={0.3}
          speed={0.5}
          scale={1.6}
          style={{
            height: '100%',
            width: '100%',
            position: 'absolute',
            top: 0,
            left: 0,
          }}
        />
      </div>

      {/* Hero Content */}
      <div className="relative z-10 flex flex-col items-center gap-6 sm:gap-8 text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="hero-badge"
        >
          <span className="hero-badge-dot" />
          Static AST Analysis Engine
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="hero-title"
        >
          <span className="hero-title-accent">SHINKEI</span>
        </motion.h1>

        {/* Kanji */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="hero-kanji"
        >
          神経 / Tree Call Graph Visualizer
        </motion.p>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="hero-subtitle"
          style={{ textAlign: 'center' }}
        >
          Trace every execution path from your entry function to all reachable calls.
          Zero runtime overhead. Full AST traversal.
        </motion.p>

        {/* CTA Button */}
        <AnimatePresence initial={false}>
          {isActive && (
            <motion.div className="inline-block relative mt-4">
              <motion.div
                style={{ borderRadius: '100px' }}
                layout
                layoutId="cta-card"
                className="absolute inset-0"
                initial={{ background: 'linear-gradient(135deg, #7c3aed, #6366f1)' }}
                animate={{ background: 'linear-gradient(135deg, #7c3aed, #6366f1)' }}
              />
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
                exit={{ opacity: 0, scale: 0.8 }}
                layout={false}
                onClick={onOpenWorkspace}
                className="relative flex items-center justify-center gap-2.5 h-14 px-8 py-3 text-lg font-semibold text-white tracking-wide cursor-pointer leading-none"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                Start Analyzing
                <ArrowRight className="w-5 h-5" />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
