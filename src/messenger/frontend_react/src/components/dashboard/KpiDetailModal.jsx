import { useEffect } from 'react';

/**
 * KPI-детализация. Простая панель со статами (label/value пары из API).
 * Расширенные секции (bars/issues/split) — отдельными фичами, когда появится
 * UTM-разметка, типизация сообщений, Sentry-интеграция.
 */
export default function KpiDetailModal({ open, onClose, title, icon, headline, headSub, details }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      className="p-3 sm:p-6"
    >
      <div
        className="w-full max-w-[640px]"
        style={{
          maxHeight: '88vh', overflowY: 'auto',
          background: 'linear-gradient(180deg, rgba(24,24,27,0.96), rgba(9,9,11,0.98))',
          border: '1px solid rgba(63,63,70,0.7)',
          borderRadius: 24,
          boxShadow: '0 40px 90px -20px rgba(0,0,0,0.7), 0 0 80px rgba(163,230,53,0.10)',
        }}
      >
        <div className="relative p-5 sm:p-7">
          <div className="absolute pointer-events-none rounded-full" style={{ width: 260, height: 260, top: -90, right: -60, background: 'rgba(163,230,53,0.10)', filter: 'blur(70px)' }} />
          <div className="relative flex items-start justify-between mb-5 sm:mb-6 gap-3">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(163,230,53,0.10)', border: '1px solid rgba(163,230,53,0.20)', color: '#a3e635' }}>
                {icon}
              </div>
              <div className="min-w-0">
                <div className="text-[10px] sm:text-[11px] uppercase text-zinc-500 mb-0.5" style={{ letterSpacing: '0.16em' }}>Детально</div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight truncate">{title}</h2>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Закрыть"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-400 hover:text-zinc-100 shrink-0"
              style={{ background: 'rgba(39,39,42,0.5)', border: '1px solid rgba(63,63,70,0.5)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
            </button>
          </div>

          {headline && (
            <div className="relative mb-5 sm:mb-6">
              <div className="text-3xl sm:text-5xl font-bold tracking-tight break-words" style={{ letterSpacing: '-0.02em', fontFamily: 'ui-monospace,monospace' }}>{headline}</div>
              {headSub && <div className="text-xs sm:text-sm text-zinc-500 mt-1.5">{headSub}</div>}
            </div>
          )}

          {details && details.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              {details.map((s, i) => (
                <div
                  key={i}
                  className="p-3 sm:p-4 rounded-2xl aspect-square sm:aspect-auto flex flex-col justify-center"
                  style={{ background: 'rgba(39,39,42,0.4)', border: '1px solid rgba(63,63,70,0.5)' }}
                >
                  <div className="text-xl sm:text-2xl font-bold leading-tight break-words" style={{ fontFamily: 'ui-monospace,monospace' }}>{s.value}</div>
                  <div className="text-[10px] sm:text-[11px] text-zinc-500 mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 sm:mt-6 p-3 sm:p-4 rounded-2xl flex items-start gap-2.5" style={{ background: 'rgba(163,230,53,0.06)', border: '1px solid rgba(163,230,53,0.18)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a3e635" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
              <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
            </svg>
            <p className="text-[11px] sm:text-xs text-zinc-400 leading-relaxed">
              Расширенная разбивка (источники трафика, типы сообщений, retention-cohorts) появится после внедрения соответствующих фич.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
