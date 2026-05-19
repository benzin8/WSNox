export function parseApiError(err, fallback = 'Произошла ошибка') {
    const detail = err?.response?.data?.detail;
    if (!detail) return fallback;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map(e => e.msg).join('. ');
    return fallback;
}
