import ComingSoon from '../ComingSoon';

export default function RetentionStrip() {
  return (
    <div className="grid grid-cols-4 gap-4">
      <ComingSoon title="Retention D1" reason="Cohort-аналитика — после event-логирования" />
      <ComingSoon title="Retention D7" reason="Cohort-аналитика — после event-логирования" />
      <ComingSoon title="Retention D30" reason="Cohort-аналитика — после event-логирования" />
      <ComingSoon title="Avg сессий / юзер" reason="Session-tracking — после event-логирования" />
    </div>
  );
}
