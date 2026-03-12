export default function Header() {
  return (
    <header className="border-b border-gray-800/60 bg-gray-950/90 backdrop-blur-md sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
            <span className="text-gray-950 text-xs font-black">P</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-extrabold bg-gradient-to-r from-emerald-400 to-emerald-300 bg-clip-text text-transparent tracking-tight">
              Polymarket
            </span>
            <span className="text-lg font-extrabold text-white tracking-tight">Analyzer</span>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-semibold text-emerald-400 tracking-wide">LIVE</span>
          </div>
        </div>
      </div>
    </header>
  );
}
