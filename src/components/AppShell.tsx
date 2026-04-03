"use client";

import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TopNav } from "@/components/TopNav";
import { TodayTab } from "@/components/tabs/TodayTab";
import { MessagesTab } from "@/components/tabs/MessagesTab";
import { TasksTab } from "@/components/tabs/TasksTab";
import { VendorsTab } from "@/components/tabs/VendorsTab";
import { CalculatorTab } from "@/components/tabs/CalculatorTab";
import { SettingsTab } from "@/components/tabs/SettingsTab";
import { CalendarTab } from "@/components/tabs/CalendarTab";
import { useProperties } from "@/lib/hooks";

const VIEW_SECTIONS: Record<string, { id: string; label: string }[]> = {
  today: [
    { id: "portfolio", label: "Portfolio" },
    { id: "analytics", label: "Analytics" },
  ],
  listings: [
    { id: "all", label: "All" },
    { id: "active", label: "Active" },
    { id: "snoozed", label: "Snoozed" },
  ],
};

export function AppShell() {
  const [activeView, setActiveView] = useState("today");
  const [activeSection, setActiveSection] = useState("portfolio");
  const { data: properties } = useProperties();

  const sections = VIEW_SECTIONS[activeView];

  const handleViewChange = (view: string) => {
    setActiveView(view);
    const defaultSection = VIEW_SECTIONS[view]?.[0]?.id;
    if (defaultSection) setActiveSection(defaultSection);
  };

  return (
    <div className="h-screen flex bg-slate-100 font-sans text-slate-900">
      <Sidebar
        activeView={activeView}
        onViewChange={handleViewChange}
        propertyCount={properties.length}
        onNewProperty={() => {}}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopNav
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          sections={sections}
        />

        <main className="flex-1 overflow-y-auto p-6">
          {activeView === "today" && <TodayTab />}
          {activeView === "listings" && <TasksTab />}
          {activeView === "calendar" && (
            <div className="max-w-3xl">
              <h2 className="text-xl font-extrabold mb-4">All Calendars</h2>
              <p className="text-slate-500 text-sm">Select a property to manage its calendar feeds.</p>
            </div>
          )}
          {activeView === "messages" && <MessagesTab />}
          {activeView === "vendors" && <VendorsTab />}
          {activeView === "settings" && <SettingsTab />}
        </main>

        {/* FAB button on Today view */}
        {activeView === "today" && (
          <button className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-[#FF385C] text-white shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center cursor-pointer">
            <span className="material-symbols-outlined text-[28px]">add</span>
          </button>
        )}
      </div>
    </div>
  );
}
