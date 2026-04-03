"use client";

import clsx from "clsx";

type NavItem = {
  id: string;
  label: string;
  icon: string;
};

const NAV_ITEMS: NavItem[] = [
  { id: "today", label: "Today", icon: "dashboard" },
  { id: "listings", label: "Listings", icon: "home" },
  { id: "calendar", label: "Calendar", icon: "calendar_today" },
  { id: "messages", label: "Messages", icon: "chat" },
  { id: "vendors", label: "Vendors", icon: "people" },
  { id: "settings", label: "Settings", icon: "settings" },
];

export function Sidebar({
  activeView,
  onViewChange,
  propertyCount,
  onNewProperty,
}: {
  activeView: string;
  onViewChange: (view: string) => void;
  propertyCount?: number;
  onNewProperty?: () => void;
}) {
  return (
    <aside className="w-56 h-full flex flex-col bg-slate-50/85 backdrop-blur-xl border-r border-white/20">
      {/* Logo */}
      <div className="px-4 pt-5 pb-6">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#FF385C] flex items-center justify-center text-white font-extrabold text-sm shadow-sm">
            R
          </div>
          <span className="font-extrabold text-lg tracking-tight text-slate-900">ROOST</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={clsx(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer",
                isActive
                  ? "text-[#FF385C] bg-white shadow-sm"
                  : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
              )}
            >
              <span
                className="material-symbols-outlined text-[20px]"
                style={isActive ? { fontVariationSettings: "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24" } : { fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
              >
                {item.icon}
              </span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="px-3 pb-4 space-y-2">
        {onNewProperty && (
          <button
            onClick={onNewProperty}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#FF385C] to-[#E31C5F] text-white text-sm font-semibold shadow-sm hover:shadow-md transition-shadow cursor-pointer"
          >
            + New Property
          </button>
        )}
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-500 hover:bg-white/60 transition-colors cursor-pointer">
          <span className="material-symbols-outlined text-[20px]">help</span>
          Help
        </button>
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-500 hover:bg-white/60 transition-colors cursor-pointer">
          <span className="material-symbols-outlined text-[20px]">logout</span>
          Logout
        </button>
      </div>
    </aside>
  );
}
