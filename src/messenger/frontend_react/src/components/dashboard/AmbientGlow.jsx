/**
 * Фоновое лаймовое свечение из дизайна. 3 пятна, 2 дрейфуют, 1 пульсирует.
 * Уважает prefers-reduced-motion: reduce.
 */
export default function AmbientGlow() {
  return (
    <>
      <style>{`
        @keyframes wsnox-drift {
          from { transform: translate(0,0); }
          to   { transform: translate(40px,-30px); }
        }
        @keyframes wsnox-pulse {
          0%,100% { opacity: 0.5; } 50% { opacity: 1; }
        }
        .wsnox-soul {
          position: fixed; border-radius: 9999px;
          pointer-events: none; z-index: 0;
          filter: blur(120px);
        }
        .wsnox-soul-drift { animation: wsnox-drift 18s ease-in-out infinite alternate; }
        .wsnox-soul-pulse { animation: wsnox-pulse 9s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .wsnox-soul-drift, .wsnox-soul-pulse { animation: none; }
        }
      `}</style>
      <div className="wsnox-soul wsnox-soul-drift" style={{ width: 560, height: 560, background: 'rgba(var(--accent-rgb),0.07)', left: -160, top: -120 }} />
      <div className="wsnox-soul wsnox-soul-pulse" style={{ width: 480, height: 480, background: 'rgba(var(--accent-rgb),0.05)', right: -140, top: 240 }} />
      <div className="wsnox-soul wsnox-soul-drift" style={{ width: 520, height: 520, background: 'rgba(132,204,22,0.045)', left: '30%', bottom: -220, animationDelay: '-6s' }} />
    </>
  );
}
