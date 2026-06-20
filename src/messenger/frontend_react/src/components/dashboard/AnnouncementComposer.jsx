import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';

/**
 * Композер объявлений в официальный канал WSNox. Виден только обладателям
 * права post_announcements. Постит через POST /api/admin/announcements
 * (multipart: text + опциональное image) — сообщение доставляется всем
 * пользователям (они состоят в канале).
 */
export default function AnnouncementComposer() {
  const [text, setText] = useState('');
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null); // {ok:bool, msg:string}
  const fileRef = useRef(null);

  const pickImage = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setResult({ ok: false, msg: 'Можно прикрепить только изображение' });
      return;
    }
    setImage(f);
    setPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
    setResult(null);
  };

  const removeImage = () => {
    setImage(null);
    setPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    if (fileRef.current) fileRef.current.value = '';
  };

  const post = async () => {
    const body = text.trim();
    if ((!body && !image) || sending) return;
    setSending(true);
    setResult(null);
    try {
      const token = localStorage.getItem('access_token');
      const fd = new FormData();
      fd.append('text', body);
      if (image) fd.append('image', image);
      const r = await fetch('/api/admin/announcements', {
        method: 'POST',
        // No Content-Type — the browser sets the multipart boundary itself.
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.detail || `HTTP ${r.status}`);
      }
      setText('');
      removeImage();
      setResult({ ok: true, msg: 'Объявление отправлено всем пользователям' });
    } catch (e) {
      setResult({ ok: false, msg: e.message || 'Ошибка' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: 'linear-gradient(160deg, color-mix(in oklab, var(--color-zinc-900) 70%, transparent), color-mix(in oklab, var(--color-zinc-900) 40%, transparent))',
        border: '1px solid color-mix(in oklab, var(--color-zinc-800) 85%, transparent)',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-lime-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>
        <h3 className="font-semibold tracking-tight">Объявление в канал WSNox</h3>
      </div>
      <p className="text-xs text-zinc-500 mb-3">Сообщение увидят все пользователи в официальном канале. Можно прикрепить картинку.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Что нового в WSNox?"
        rows={3}
        disabled={sending}
        className="w-full px-4 py-3 rounded-xl bg-zinc-900 border text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-lime-400 transition-colors resize-y"
        style={{ borderColor: 'color-mix(in oklab, var(--color-zinc-700) 60%, transparent)' }}
      />

      {preview && (
        <div className="relative mt-3 inline-block">
          <img src={preview} alt="" className="max-h-40 rounded-xl border border-zinc-700/60" />
          <button
            type="button"
            onClick={removeImage}
            aria-label="Убрать картинку"
            className="absolute -top-2 -right-2 w-6 h-6 grid place-items-center rounded-full bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" onChange={pickImage} className="hidden" />

      <div className="flex items-center justify-between gap-3 mt-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={sending}
            title="Прикрепить картинку"
            className="shrink-0 w-9 h-9 grid place-items-center rounded-xl bg-zinc-800/60 border border-zinc-700/60 text-zinc-300 hover:text-lime-400 hover:border-lime-400/40 transition-colors disabled:opacity-40"
          >
            <ImagePlus size={18} />
          </button>
          <div className="text-xs truncate" style={{ color: result ? (result.ok ? 'var(--color-lime-400)' : '#f87171') : 'transparent' }}>
            {result?.msg || '.'}
          </div>
        </div>
        <button
          type="button"
          onClick={post}
          disabled={(!text.trim() && !image) || sending}
          className="px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          style={{ background: 'var(--color-lime-400)', color: '#09090b' }}
        >
          {sending ? 'Отправка…' : 'Опубликовать'}
        </button>
      </div>
    </div>
  );
}
