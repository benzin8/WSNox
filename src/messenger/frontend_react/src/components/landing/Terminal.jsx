export function Terminal() {
  return (
    <div
      className="w-full rounded-2xl overflow-hidden"
      style={{
        background: '#0a0a0c',
        border: '1px solid rgba(63,63,70,0.6)',
        boxShadow: '0 40px 80px -20px rgba(0,0,0,0.6), 0 0 60px rgba(163,230,53,0.10)',
      }}
    >
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ background: '#18181b', borderBottom: '1px solid rgba(63,63,70,0.5)' }}
      >
        <div className="w-3 h-3 rounded-full" style={{ background: '#ff5f57' }} />
        <div className="w-3 h-3 rounded-full" style={{ background: '#ffbd2e' }} />
        <div className="w-3 h-3 rounded-full" style={{ background: '#28ca42' }} />
        <span className="ml-3 text-[11px] text-zinc-500 font-mono">
          ~/projects/wsnox — zsh
        </span>
      </div>
      <div className="p-5 font-mono text-[13px] leading-relaxed" style={{ color: '#d4d4d8' }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lime-400">➜</span>
          <span className="text-sky-400">wsnox</span>
          <span className="text-zinc-500">git:(</span>
          <span className="text-amber-400">main</span>
          <span className="text-zinc-500">)</span>
        </div>
        <div className="pl-5 mb-3 text-zinc-500"># Поднять локально:</div>
        <div className="pl-5 mb-1">
          <span className="text-lime-400">$</span>{' '}
          <span className="text-zinc-200">git clone </span>
          <span className="text-amber-300">github.com/wsnox/wsnox</span>
        </div>
        <div className="pl-5 mb-1">
          <span className="text-lime-400">$</span>{' '}
          <span className="text-zinc-200">cd wsnox && npm install</span>
        </div>
        <div className="pl-5 mb-3">
          <span className="text-lime-400">$</span>{' '}
          <span className="text-zinc-200">npm run dev</span>
        </div>
        <div className="pl-5 text-zinc-500 mb-1">✓ Dependencies installed</div>
        <div className="pl-5 text-zinc-500 mb-1">
          ✓ Server ready on <span className="text-lime-400">:3000</span>
        </div>
        <div className="pl-5 text-zinc-500 mb-1">✓ WebSocket listening</div>
        <div className="pl-5 mt-2 flex items-center gap-2">
          <span className="text-lime-400">➜</span>
          <span className="terminal-cursor" />
        </div>
      </div>
    </div>
  );
}
