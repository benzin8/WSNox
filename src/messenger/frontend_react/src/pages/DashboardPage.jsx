import { useNavigate } from 'react-router-dom';

import AmbientGlow from '../components/dashboard/AmbientGlow';
import PeriodSwitch from '../components/dashboard/PeriodSwitch';
import KpiCard from '../components/dashboard/KpiCard';
import ComingSoon from '../components/dashboard/ComingSoon';
import GrowthPanel from '../components/dashboard/panels/GrowthPanel';
import ActivityPanel from '../components/dashboard/panels/ActivityPanel';
import LivePanel from '../components/dashboard/panels/LivePanel';
import FunnelPanel from '../components/dashboard/panels/FunnelPanel';
import HealthPanel from '../components/dashboard/panels/HealthPanel';
import GeoPanel from '../components/dashboard/panels/GeoPanel';
import FeedPanel from '../components/dashboard/panels/FeedPanel';
import RetentionStrip from '../components/dashboard/panels/RetentionStrip';

import { useAdminStats } from '../hooks/useAdminStats';

const ICONS = {
  users: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  msg: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></svg>,
  act: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>,
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { stats, loading, error, days, setDays } = useAdminStats(30);

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
    <div className="min-h-dvh bg-zinc-950" style={{ position: 'relative' }}>
      <AmbientGlow />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <header
          className="sticky top-0 z-40 flex items-center justify-between px-8 h-16"
          style={{ background: 'rgba(9,9,11,0.78)', backdropFilter: 'blur(14px) saturate(1.4)', borderBottom: '1px solid rgba(39,39,42,0.6)' }}
        >
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/chat')} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#a3e635' }} aria-label="Вернуться в чат">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#18181b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <span className="text-lg font-semibold tracking-tight">WSNox</span>
            <span className="text-zinc-600">/</span>
            <span className="text-sm text-zinc-400">Дашборд основателя</span>
          </div>
          <PeriodSwitch days={days} onChange={setDays} />
        </header>

        <main className="px-8 py-8 max-w-[1400px] mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight" style={{ letterSpacing: '-0.02em' }}>Привет 👋</h1>
            <p className="text-zinc-500 mt-1.5">Вот как поживает WSNox за последние {days} дней.</p>
          </div>

          <section className="grid grid-cols-4 gap-4 mb-4">
            <KpiCard
              icon={ICONS.users}
              label="Регистраций"
              sub="всего пользователей"
              value={stats.kpis.users.total}
              delta={stats.kpis.users.deltas[String(days)] ?? 0}
              series={stats.regs}
              days={days}
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
            />
            <KpiCard
              icon={ICONS.act}
              label="DAU"
              sub={`MAU ${stats.kpis.dau.mau} · sticky ${stats.kpis.dau.stickiness}%`}
              value={stats.kpis.dau.value}
              delta={stats.kpis.dau.deltas[String(days)] ?? 0}
              series={stats.dau}
              days={days}
            />
            <ComingSoon title="Проблемы" reason="Появится после интеграции Sentry SDK" />
          </section>

          <section className="grid grid-cols-3 gap-4 mb-4">
            <GrowthPanel regs={stats.regs} labels={stats.labels} days={days} />
            <LivePanel live={stats.live} />
          </section>

          <section className="grid grid-cols-3 gap-4 mb-4">
            <ActivityPanel msgs={stats.msgs} labels={stats.labels} days={days} />
            <FunnelPanel />
          </section>

          <section className="grid grid-cols-3 gap-4 mb-4">
            <HealthPanel />
            <GeoPanel />
            <FeedPanel />
          </section>

          <section>
            <RetentionStrip />
          </section>
        </main>
      </div>
    </div>
  );
}
