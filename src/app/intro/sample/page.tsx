export default function SampleIntroPage() {
  return (
    <div className="min-h-screen bg-[#f0eeeb]">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          {/* Left: Photo placeholder */}
          <div className="md:w-[300px] shrink-0">
            <div className="w-full aspect-[3/4] rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
              <span className="text-6xl font-bold text-white/60">S</span>
            </div>
          </div>

          {/* Right: Sample profile */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 pt-6 pb-1">
                <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
                <span className="text-xs text-gray-300 font-medium tracking-wide">allenby</span>
              </div>
              <div className="px-6 pb-6">
                {[
                  ["First Name", "Sarah"],
                  ["Location", "📍 Tel Aviv, Israel"],
                  ["Birthdate", "1993"],
                  ["Occupation", "Product Designer"],
                  ["Faith/Religion", "Jewish"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-3.5 border-b border-gray-100 last:border-0"
                  >
                    <span className="text-gray-400 text-sm sm:w-[260px] shrink-0">{label}</span>
                    <span className="text-gray-800 text-sm font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-xs text-gray-400">Shared via Agent Matcha</p>
        </div>
      </div>
    </div>
  );
}
