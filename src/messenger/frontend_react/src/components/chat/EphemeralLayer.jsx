import { useEffect, useRef, useState } from "react";
import { Flame, X, Send, ShieldOff } from "lucide-react";

// One-time chats follow the user's chosen accent (via --accent-rgb), but a few
// shades darker and greyer — a dimmed, "secret" variant of their normal theme.
// The burn/destruct stays fiery regardless of accent.
const EPH_VARS = {
    "--eph-accent": "rgb(var(--accent-rgb))",
    "--eph-bubble": "color-mix(in srgb, rgb(var(--accent-rgb)) 50%, #27272a 50%)",
    "--eph-surface": "color-mix(in srgb, rgb(var(--accent-rgb)) 7%, #0a0a0d)",
    "--eph-soft": "rgba(var(--accent-rgb), 0.14)",
    "--eph-border": "rgba(var(--accent-rgb), 0.30)",
};

/**
 * Renders everything for one-time chats: incoming invite prompt, a "waiting to
 * be accepted" card, the live window (with self-destruct), and a toast.
 * Purely presentational — all state/logic comes from useEphemeral.
 */
export function EphemeralLayer({ eph }) {
    const { incomingInvite, waiting, session, messages, peerTyping, toast,
        cancelInvite, accept, decline, send, sendTyping, leave, myId } = eph;

    return (
        <>
            {toast && (
                <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[120] animate-fadeIn">
                    <div className="px-4 py-2 rounded-xl bg-zinc-900/95 border border-zinc-700 text-zinc-200 text-sm shadow-xl backdrop-blur-md">
                        {toast.text}
                    </div>
                </div>
            )}

            {incomingInvite && !session && (
                <InvitePrompt invite={incomingInvite} onAccept={accept} onDecline={decline} />
            )}

            {waiting && !session && (
                <WaitingCard waiting={waiting} onCancel={cancelInvite} />
            )}

            {session && (
                <EphemeralWindow
                    session={session}
                    messages={messages}
                    peerTyping={peerTyping}
                    myId={myId}
                    onSend={send}
                    onTyping={sendTyping}
                    onLeave={leave}
                />
            )}
        </>
    );
}

function InvitePrompt({ invite, onAccept, onDecline }) {
    return (
        <div className="fixed inset-0 z-[115] flex items-center justify-center p-4 bg-black/65 backdrop-blur-2xl animate-fadeIn" style={EPH_VARS}>
            <div className="relative w-full max-w-sm rounded-3xl border border-[var(--eph-border)] bg-zinc-950/95 p-7 text-center shadow-2xl animate-popIn overflow-hidden">
                <div className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-[var(--eph-soft)] blur-[90px]" />
                <div className="relative">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--eph-soft)] border border-[var(--eph-border)] animate-emberPulse">
                        <Flame className="h-8 w-8 text-[var(--eph-accent)]" />
                    </div>
                    <h3 className="text-lg font-bold text-zinc-100">Одноразовый чат</h3>
                    <p className="mt-2 text-sm text-zinc-400">
                        <span className="text-[var(--eph-accent)] font-medium">{invite.fromName || "Собеседник"}</span>{" "}
                        предлагает одноразовый чат.
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                        Сообщения нигде не сохраняются и исчезнут, как только кто-то выйдет.
                    </p>
                    <div className="mt-6 flex gap-3">
                        <button
                            onClick={onDecline}
                            className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 active:scale-[0.98]"
                        >
                            Отклонить
                        </button>
                        <button
                            onClick={onAccept}
                            className="flex-1 rounded-xl bg-[var(--eph-accent)] py-2.5 text-sm font-semibold text-zinc-950 transition-transform hover:brightness-110 active:scale-[0.98]"
                        >
                            Принять 🔥
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function WaitingCard({ waiting, onCancel }) {
    return (
        <div className="fixed inset-0 z-[115] flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xl animate-fadeIn" style={EPH_VARS}>
            <div className="w-full max-w-xs rounded-3xl border border-[var(--eph-border)] bg-zinc-950/95 p-7 text-center shadow-2xl animate-popIn">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--eph-soft)] border border-[var(--eph-border)] animate-emberPulse">
                    <Flame className="h-7 w-7 text-[var(--eph-accent)]" />
                </div>
                <p className="text-sm text-zinc-300">
                    Ждём, пока{" "}
                    <span className="text-[var(--eph-accent)] font-medium">{waiting.toName || "собеседник"}</span>{" "}
                    примет одноразовый чат…
                </p>
                <div className="mt-4 flex justify-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--eph-accent)] animate-bounce [animation-delay:-0.2s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--eph-accent)] animate-bounce [animation-delay:-0.1s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--eph-accent)] animate-bounce" />
                </div>
                <button
                    onClick={onCancel}
                    className="mt-6 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                >
                    Отменить
                </button>
            </div>
        </div>
    );
}

function closingNotice(session, myId) {
    const peerActed = session.byId != null && Number(session.byId) !== Number(myId);
    if (session.reason === "disconnect") return "Собеседник отключился";
    if (peerActed) return "Собеседник вышел";
    return "Чат закрыт";
}

function EphemeralWindow({ session, messages, peerTyping, myId, onSend, onTyping, onLeave }) {
    const [text, setText] = useState("");
    const scrollRef = useRef(null);
    const lastTyping = useRef(0);
    const destroying = session.status === "destroying";

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages, peerTyping]);

    const submit = (e) => {
        e?.preventDefault?.();
        if (!text.trim()) return;
        onSend(text);
        setText("");
        onTyping(false);
        lastTyping.current = 0;
    };

    const onChange = (e) => {
        setText(e.target.value);
        const now = Date.now();
        if (now - lastTyping.current > 2000) {
            onTyping(true);
            lastTyping.current = now;
        }
    };

    return (
        <div className={`fixed inset-0 z-[110] flex items-center justify-center p-0 sm:p-4 ${destroying ? "pointer-events-none" : ""}`} style={EPH_VARS}>
            {/* blurred backdrop over the rest of the app */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-2xl animate-fadeIn" />
            <div
                className={`relative flex h-full w-full max-w-lg flex-col overflow-hidden border border-[var(--eph-border)] bg-[var(--eph-surface)] shadow-2xl sm:h-[88vh] sm:rounded-3xl ${destroying ? "animate-ephDestruct" : "animate-ephOverlayIn"}`}
            >
                {/* accent glow */}
                <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-[var(--eph-soft)] blur-[100px]" />

                {/* header */}
                <header className="relative z-10 flex h-16 flex-shrink-0 items-center justify-between border-b border-zinc-800/70 bg-black/30 px-4 backdrop-blur-md">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--eph-soft)] border border-[var(--eph-border)] animate-emberPulse">
                            <Flame className="h-5 w-5 text-[var(--eph-accent)]" />
                        </div>
                        <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-zinc-100">
                                {session.peer?.name || "Одноразовый чат"}
                            </div>
                            <div className="text-[11px] font-medium text-[var(--eph-accent)]">🔥 одноразовый · не сохраняется</div>
                        </div>
                    </div>
                    <button
                        onClick={onLeave}
                        title="Выйти и уничтожить чат"
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 active:scale-95"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </header>

                {/* privacy banner */}
                <div className="relative z-10 flex items-center gap-2 border-b border-zinc-900 bg-[var(--eph-soft)] px-4 py-2 text-[11px] text-zinc-300">
                    <ShieldOff className="h-3.5 w-3.5 flex-shrink-0 text-[var(--eph-accent)]" />
                    <span>Сообщения не сохраняются. Чат исчезнет у обоих, если кто-то выйдет, закроет или свернёт окно.</span>
                </div>

                {/* messages */}
                <div ref={scrollRef} className="relative z-10 flex-1 space-y-2 overflow-y-auto px-4 py-4">
                    {messages.length === 0 && (
                        <div className="mt-10 text-center text-sm text-zinc-600">
                            Начните разговор — он испарится без следа.
                        </div>
                    )}
                    {messages.map((m) => (
                        <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                            <div
                                className={`max-w-[78%] animate-ephMsgIn whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm text-zinc-100 ${
                                    m.mine
                                        ? "rounded-br-md bg-[var(--eph-bubble)]"
                                        : "rounded-bl-md bg-zinc-800"
                                } ${m.status === "sending" ? "opacity-70" : ""}`}
                            >
                                {m.text}
                            </div>
                        </div>
                    ))}
                    {peerTyping && (
                        <div className="flex justify-start">
                            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-zinc-800 px-3 py-2.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:-0.2s]" />
                                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:-0.1s]" />
                                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce" />
                            </div>
                        </div>
                    )}
                </div>

                {/* closing / burned overlay — warns the other side the chat is ending */}
                {destroying && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-zinc-950/70 backdrop-blur-sm">
                        <Flame className="h-11 w-11 text-amber-400 animate-emberPulse" />
                        <div className="text-base font-semibold text-amber-200">{closingNotice(session, myId)}</div>
                        <div className="text-xs text-amber-300/80">Чат закрывается и сгорает без следа 🔥</div>
                    </div>
                )}

                {/* input */}
                <form onSubmit={submit} className="relative z-10 flex flex-shrink-0 items-center gap-2 border-t border-zinc-800/70 bg-black/30 p-3 backdrop-blur-md">
                    <input
                        value={text}
                        onChange={onChange}
                        disabled={destroying}
                        placeholder="Сообщение, которое исчезнет…"
                        className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-[var(--eph-border)]"
                    />
                    <button
                        type="submit"
                        disabled={!text.trim() || destroying}
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--eph-accent)] text-zinc-950 transition-transform enabled:hover:brightness-110 enabled:active:scale-95 disabled:opacity-40"
                    >
                        <Send className="h-4.5 w-4.5" />
                    </button>
                </form>
            </div>
        </div>
    );
}
