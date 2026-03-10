export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-emerald-400">Polymarket Analyzer</h1>
        <p className="text-gray-400">Tailwind CSS is working</p>
        <div className="flex gap-3 justify-center">
          <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm">Next.js 15</span>
          <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm">FastAPI</span>
          <span className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-sm">Tailwind v4</span>
        </div>
      </div>
    </main>
  );
}
