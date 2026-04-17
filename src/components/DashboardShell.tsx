"use client";

import { useState } from "react";
import clsx from "clsx";
import { useProperties } from "@/lib/hooks";
import { TodayTab } from "@/components/tabs/TodayTab";
import { MessagesTab } from "@/components/tabs/MessagesTab";
import { TasksTab } from "@/components/tabs/TasksTab";
import { VendorsTab } from "@/components/tabs/VendorsTab";
import { CalculatorTab } from "@/components/tabs/CalculatorTab";
import { SettingsTab } from "@/components/tabs/SettingsTab";
import { PropertyInfoTab } from "@/components/tabs/PropertyInfoTab";
import { PropertyRulesTab } from "@/components/tabs/PropertyRulesTab";
import { CalendarTab } from "@/components/tabs/CalendarTab";
import { InboxTab } from "@/components/tabs/InboxTab";
import { StatusBadge } from "@/components/ui";

const DASHBOARD_TABS = [
  { id: "today", label: "Today" },
  { id: "messages", label: "Messages" },
  { id: "calendar", label: "Calendar" },
  { id: "tasks", label: "Tasks" },
  { id: "calculator", label: "Calculator" },
  { id: "pricing", label: "Pricing" },
  { id: "vendors", label: "Vendors" },
  { id: "reminders", label: "Reminders" },
  { id: "master", label: "Master" },
  { id: "settings", label: "Settings" },
];

const INBOX_SENTINEL = "__inbox__";

const PROPERTY_TABS = [
  { id: "info", label: "Info & Access" },
  { id: "rules", label: "Rules / HOA" },
  { id: "calendar", label: "Calendar" },
  { id: "tasks", label: "Tasks" },
  { id: "analytics", label: "Analytics" },
  { id: "pricing", label: "Pricing" },
  { id: "calculator", label: "Calculator" },
  { id: "listing", label: "Listing" },
  { id: "api", label: "API" },
];

export function DashboardShell() {
  const { data: properties, loading, refetch } = useProperties();
  const [sidebarSelection, setSidebarSelection] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("today");

  const isInboxView = sidebarSelection === INBOX_SENTINEL;
  const isPropertyView =
    sidebarSelection !== null && sidebarSelection !== INBOX_SENTINEL;
  const tabs = isPropertyView ? PROPERTY_TABS : DASHBOARD_TABS;
  const selectedProperty = isPropertyView
    ? properties.find((p) => p.id === sidebarSelection)
    : undefined;

  const selectSidebar = (id: string | null) => {
    setSidebarSelection(id);
    if (id === null) setActiveTab("today");
    else if (id === INBOX_SENTINEL) setActiveTab("inbox");
    else setActiveTab("info");
  };

  return (
    <div className="h-screen flex flex-col font-sans bg-surface-soft text-txt">
      <header className="flex items-center justify-between px-4 py-2 bg-white border-b border-surface-muted flex-shrink-0">
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-white font-extrabold text-sm">R</div>
          <span className="font-extrabold text-base">ROOST</span>
        </div>
        <div className="flex gap-1 overflow-x-auto flex-1 justify-center ml-4">
          {!isInboxView &&
            tabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={clsx("top-pill", activeTab === tab.id && "active")}>
                {tab.label}
              </button>
            ))}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-52 flex-shrink-0 border-r border-surface-muted bg-white overflow-y-auto">
          <div className="px-3 pt-3 pb-1 text-[11px] font-bold text-txt-secondary uppercase tracking-wide">Views</div>
          <button onClick={() => selectSidebar(null)} className={clsx("sidebar-item", !isPropertyView && "active")}>
            <span className={clsx("text-sm", !isPropertyView ? "font-bold text-brand" : "text-txt")}>Dashboard</span>
            <span className="text-[10px] text-txt-secondary">All properties</span>
          </button>
          <div className="px-3 pt-4 pb-1 text-[11px] font-bold text-txt-secondary uppercase tracking-wide">
            {"Properties (" + properties.length + ")"}
          </div>
          {properties.map((p) => (
            <button key={p.id} onClick={() => selectSidebar(p.id)} className={clsx("sidebar-item", sidebarSelection === p.id && "active")}>
              <span className={clsx("text-xs leading-snug", sidebarSelection === p.id ? "font-bold" : "font-medium")}>{p.name}</span>
              <div className="flex items-center gap-2 mt-0.5">
                <StatusBadge status={p.status} />
                <span className="text-[10px] text-txt-secondary">{"$" + p.price_per_night + "/n"}</span>
              </div>
            </button>
          ))}
          <button className="mx-1 my-2 p-2 w-[calc(100%-8px)] border border-dashed border-surface-muted rounded-lg text-txt-secondary text-xs cursor-pointer hover:border-txt-secondary transition-colors">
            + Add Property
          </button>

          <div className="px-3 pt-4 pb-1 text-[11px] font-bold text-txt-secondary uppercase tracking-wide">
            Tools
          </div>
          <button
            onClick={() => selectSidebar(INBOX_SENTINEL)}
            className={clsx("sidebar-item", isInboxView && "active")}
          >
            <div className="flex items-center gap-2">
              <span
                className="material-symbols-outlined text-[18px]"
                style={
                  isInboxView
                    ? { fontVariationSettings: "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24" }
                    : undefined
                }
              >
                inbox
              </span>
              <span className={clsx("text-sm", isInboxView ? "font-bold text-brand" : "text-txt")}>
                Inbox
              </span>
            </div>
            <span className="text-[10px] text-txt-secondary ml-6">All emails</span>
          </button>
        </aside>

        <main className="flex-1 overflow-y-auto p-5">
          {loading && <p className="text-txt-secondary">Loading...</p>}
          {!isPropertyView && activeTab === "today" && <TodayTab />}
          {!isPropertyView && activeTab === "messages" && <MessagesTab />}
          {!isPropertyView && activeTab === "calendar" && <Placeholder title="All Calendars" msg="Select a property to manage its calendar feeds." />}
          {!isPropertyView && activeTab === "tasks" && <TasksTab />}
          {!isPropertyView && activeTab === "calculator" && <CalculatorTab />}
          {!isPropertyView && activeTab === "pricing" && <Placeholder title="Pricing Assistant" msg="Select a property to see pricing recommendations." />}
          {!isPropertyView && activeTab === "vendors" && <VendorsTab />}
          {!isPropertyView && activeTab === "reminders" && <TasksTab />}
          {!isPropertyView && activeTab === "master" && <Placeholder title="Master Listing Settings" msg="Sync settings across all platforms." />}
          {!isPropertyView && !isInboxView && activeTab === "settings" && <SettingsTab />}
          {isInboxView && <InboxTab />}
          {isPropertyView && selectedProperty && activeTab === "info" && <PropertyInfoTab property={selectedProperty} onUpdate={refetch} />}
          {isPropertyView && selectedProperty && activeTab === "rules" && <PropertyRulesTab property={selectedProperty} />}
          {isPropertyView && selectedProperty && activeTab === "calendar" && <CalendarTab property={selectedProperty} />}
          {isPropertyView && selectedProperty && activeTab === "tasks" && <TasksTab propertyId={selectedProperty.id} />}
          {isPropertyView && selectedProperty && activeTab === "analytics" && <Placeholder title="Analytics" msg="Revenue, occupancy, performance." />}
          {isPropertyView && selectedProperty && activeTab === "pricing" && <Placeholder title="Pricing" msg="Rate recommendations for this property." />}
          {isPropertyView && selectedProperty && activeTab === "calculator" && <CalculatorTab propertyId={selectedProperty.id} />}
          {isPropertyView && selectedProperty && activeTab === "listing" && <Placeholder title="Listing Settings" msg="Per-property overrides." />}
          {isPropertyView && selectedProperty && activeTab === "api" && <Placeholder title="API Configuration" msg="iCal sync handles integration." />}
        </main>
      </div>
    </div>
  );
}

function Placeholder({ title, msg }: { title: string; msg: string }) {
  return <div className="max-w-3xl"><h2 className="text-xl font-extrabold mb-4">{title}</h2><p className="text-txt-secondary text-sm">{msg}</p></div>;
}
