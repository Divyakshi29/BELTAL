export default function SettingsPage() {
  return (
    <section className="min-h-full bg-[radial-gradient(circle_at_90%_0%,#dbeeff_0%,transparent_30rem),#F4F8FC] px-5 py-8 text-[#0D2B4E] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-4xl">
        <header className="mb-7">
          <p className="text-xs font-bold tracking-[.18em] text-[#1E8A9B] uppercase">Officer Console</p>
          <h1 className="mt-2 text-3xl font-black">Settings</h1>
          <p className="mt-2 text-sm text-[#58718B]">BELTAL uses a consistent light workspace throughout the application.</p>
        </header>
        <div className="rounded-2xl border border-[#B9DCEF] bg-white/65 p-6 shadow-[0_14px_35px_rgba(13,43,78,.13)] backdrop-blur-xl">
          <div className="flex items-start gap-4">
            <span className="material-symbols-outlined rounded-xl bg-[#1E5FA8]/15 p-3 text-[#1E5FA8]">light_mode</span>
            <div>
              <h2 className="text-base font-bold">Light workspace</h2>
              <p className="mt-1 text-sm text-[#58718B]">A single light theme keeps navigation, forms, and authentication easy to read.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
