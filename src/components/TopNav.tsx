"use client";

import clsx from "clsx";

export function TopNav({
  activeSection,
  onSectionChange,
  sections,
}: {
  activeSection?: string;
  onSectionChange?: (section: string) => void;
  sections?: { id: string; label: string }[];
}) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 bg-slate-50/85 backdrop-blur-xl border-b border-white/20">
      {/* Search bar */}
      <div className="flex items-center gap-2 bg-white/80 border border-slate-200 rounded-xl px-3 py-2 w-72">
        <span className="material-symbols-outlined text-slate-400 text-[18px]">search</span>
        <input
          type="text"
          placeholder="Search properties, guests, tasks..."
          className="bg-transparent outline-none text-sm text-slate-700 placeholder-slate-400 w-full"
        />
      </div>

      {/* Tab switcher */}
      {sections && sections.length > 0 && (
        <div className="flex items-center gap-1 bg-white/60 rounded-xl p-1">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => onSectionChange?.(section.id)}
              className={clsx(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer",
                activeSection === section.id
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              {section.label}
            </button>
          ))}
        </div>
      )}

      {/* Right side actions */}
      <div className="flex items-center gap-3">
        {/* Notification bell */}
        <button className="relative p-2 rounded-xl hover:bg-white/60 transition-colors cursor-pointer">
          <span className="material-symbols-outlined text-slate-600 text-[22px]">notifications</span>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#FF385C] rounded-full" />
        </button>

        {/* Apps grid */}
        <button className="p-2 rounded-xl hover:bg-white/60 transition-colors cursor-pointer">
          <span className="material-symbols-outlined text-slate-600 text-[22px]">apps</span>
        </button>

        {/* Profile avatar */}
        <button className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FF385C] to-[#E31C5F] text-white text-xs font-bold flex items-center justify-center cursor-pointer">
          M
        </button>
      </div>
    </header>
  );
}
