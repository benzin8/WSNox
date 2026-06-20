import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import AmbientGlow from '../components/dashboard/AmbientGlow';
import PeriodSwitch from '../components/dashboard/PeriodSwitch';
import KpiCard from '../components/dashboard/KpiCard';
import KpiDetailModal from '../components/dashboard/KpiDetailModal';
import ComingSoon from '../components/dashboard/ComingSoon';
import GrowthPanel from '../components/dashboard/panels/GrowthPanel';
import ActivityPanel from '../components/dashboard/panels/ActivityPanel';
import LivePanel from '../components/dashboard/panels/LivePanel';
import FunnelPanel from '../components/dashboard/panels/FunnelPanel';
import HealthPanel from '../components/dashboard/panels/HealthPanel';
import GeoPanel from '../components/dashboard/panels/GeoPanel';
import FeedPanel from '../components/dashboard/panels/FeedPanel';
import RetentionStrip from '../components/dashboard/panels/RetentionStrip';
import AnnouncementComposer from '../components/dashboard/AnnouncementComposer';

import { useAdminStats } from '../hooks/useAdminStats';
import { useIsAdmin } from '../hooks/useIsAdmin';

const ICONS = {
  users: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  msg: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></svg>,
  act: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>,
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { stats, loading, error, days, setDays } = useAdminStats(30);
  const { canPostAnnouncements } = useIsAdmin();
  const [activeKpi, setActiveKpi] = useState(null);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-zinc-950">
        <div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (error || !stats) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-zinc-950 text-zinc-400">
        Не удалось загрузить статистику
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-zinc-950 overflow-y-auto" style={{ position: 'relative' }}>
      <AmbientGlow />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <header
          className="sticky top-0 z-40 flex items-center justify-between gap-3 px-4 sm:px-8 h-16"
          style={{ background: 'color-mix(in oklab, var(--color-zinc-950) 78%, transparent)', backdropFilter: 'blur(14px) saturate(1.4)', borderBottom: '1px solid color-mix(in oklab, var(--color-zinc-800) 60%, transparent)' }}
        >
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button onClick={() => navigate('/chat')} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--color-lime-400)' }} aria-label="Вернуться в чат">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#18181b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <span className="text-base sm:text-lg font-semibold tracking-tight">WSNox</span>
            <span className="text-zinc-600 hidden sm:inline">/</span>
            <span className="text-sm text-zinc-400 hidden sm:inline">Дашборд</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/dashboard/users')}
              title="Управление юзерами"
              aria-label="Открыть список юзеров"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-lime-400 hover:bg-zinc-800 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </button>
            <PeriodSwitch days={days} onChange={setDays} />
          </div>
        </header>

        <main className="px-4 sm:px-8 py-6 sm:py-8 max-w-[1400px] mx-auto">
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ letterSpacing: '-0.02em' }}>Привет 👋</h1>
            <p className="text-zinc-500 mt-1.5 text-sm sm:text-base">Вот как поживает WSNox за последние {days} дней.</p>
          </div>

          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <KpiCard
              icon={ICONS.users}
              label="Регистраций"
              sub="всего пользователей"
              value={stats.kpis.users.total}
              delta={stats.kpis.users.deltas[String(days)] ?? 0}
              series={stats.regs}
              days={days}
              detailsAvailable={!!stats.kpis.users.details}
              onClick={() => setActiveKpi('users')}
            />
            <KpiCard
              icon={ICONS.msg}
              label="Сообщений"
              sub="всего отправлено"
              value={stats.kpis.msgs.total}
              big
              delta={stats.kpis.msgs.deltas[String(days)] ?? 0}
              series={stats.msgs}
              days={days}
              detailsAvailable={!!stats.kpis.msgs.details}
              onClick={() => setActiveKpi('msgs')}
            />
            <KpiCard
              icon={ICONS.act}
              label="DAU"
              sub={`MAU ${stats.kpis.dau.mau} · sticky ${stats.kpis.dau.stickiness}%`}
              value={stats.kpis.dau.value}
              delta={stats.kpis.dau.deltas[String(days)] ?? 0}
              series={stats.dau}
              days={days}
              detailsAvailable={!!stats.kpis.dau.details}
              onClick={() => setActiveKpi('dau')}
            />
            <ComingSoon title="Проблемы" reason="Появится после интеграции Sentry SDK" />
          </section>

          <KpiDetailModal
            open={activeKpi === 'users'}
            onClose={() => setActiveKpi(null)}
            title="Регистрации"
            icon={ICONS.users}
            headline={stats.kpis.users.total.toLocaleString('ru-RU')}
            headSub="всего пользователей"
            details={stats.kpis.users.details}
          />
          <KpiDetailModal
            open={activeKpi === 'msgs'}
            onClose={() => setActiveKpi(null)}
            title="Сообщения"
            icon={ICONS.msg}
            headline={stats.kpis.msgs.total.toLocaleString('ru-RU')}
            headSub="всего отправлено"
            details={stats.kpis.msgs.details}
          />
          <KpiDetailModal
            open={activeKpi === 'dau'}
            onClose={() => setActiveKpi(null)}
            title="Daily Active Users"
            icon={ICONS.act}
            headline={stats.kpis.dau.value.toLocaleString('ru-RU')}
            headSub={`MAU ${stats.kpis.dau.mau} · stickiness ${stats.kpis.dau.stickiness}%`}
            details={stats.kpis.dau.details}
          />

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <GrowthPanel regs={stats.regs} labels={stats.labels} days={days} />
            <LivePanel live={stats.live} />
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <ActivityPanel msgs={stats.msgs} labels={stats.labels} days={days} />
            <FunnelPanel funnel={stats.funnel} />
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <HealthPanel health={stats.health} />
            <GeoPanel breakdown={stats.breakdown} />
            <FeedPanel feed={stats.feed} />
          </section>

          <section className="mb-4">
            <RetentionStrip retention={stats.retention} stickiness={stats.kpis.dau.stickiness} />
          </section>

          {canPostAnnouncements && (
            <section>
              <AnnouncementComposer />
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
