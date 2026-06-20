import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Megaphone, Loader2 } from 'lucide-react';

// Landing for channel invite links (/join/:token). We don't join here — we
// stash the token and route on: straight to the chat if logged in (ChatPage
// redeems the token on mount), otherwise through auth first (the token
// survives in localStorage and is redeemed once the user lands in /chat).
export default function JoinChannelPage() {
  const { token } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (token) localStorage.setItem('pending_join_channel', token);
    const authed = !!localStorage.getItem('access_token');
    navigate(authed ? '/chat' : '/auth/send-code', { replace: true });
  }, [token, navigate]);

  return (
    <div className="min-h-dvh flex items-center justify-center p-8">
      <div className="flex flex-col items-center text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-lime-400/10 border border-lime-400/20 flex items-center justify-center">
          <Megaphone size={30} className="text-lime-400" />
        </div>
        <Loader2 size={22} className="text-lime-400 animate-spin" />
        <p className="text-sm text-zinc-400">Открываем приглашение в канал…</p>
      </div>
    </div>
  );
}
