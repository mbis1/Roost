"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { useProperties } from "@/lib/hooks";
import { StatusBadge } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { AddPropertyModal } from "@/components/modals/AddPropertyModal";
import { PropertyHub } from "@/components/property/PropertyHub";
import { MessagesTab } from "@/components/tabs/MessagesTab";
import { CalendarTab } from "@/components/tabs/CalendarTab";
import { VendorsTab } from "@/components/tabs/VendorsTab";
import { TasksTab } from "@/components/tabs/TasksTab";
import { useProperty } from "@/lib/hooks";

const PROPERTY_TABS = [
  { id: "overview", label: "Overview", icon: "home" },
  { id: "messages", label: "Messages", icon: "chat" },
  { id: "calendar", label: "Calendar", icon: "calendar_today" },
  { id: "vendors", label: "Vendors", icon: "people" },
  { id: "tasks", label: "Tasks", icon: "task_alt" },
];

export function PropertyShell({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const { data: properties } = useProperties();
  const { data: property } = useProperty(propertyId);
  const [activeTab, setActiveTab] = useState("overview");
  const [showAddModal, setShowAddModal] = useState(false);

  return (
    <div className="h-screen flex flex-col font-sans bg-surface-soft text-txt">
      <header className="flex items-center justify-between px-4 py-2 bg-white border-b border-surface-muted flex-shrink-0">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 flex-shrink-0 cursor-pointer"
        >
          <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-white font-extrabold text-sm">
            R
          </div>
          <span className="font-extrabold text-base">ROOST</span>
        </button>
        <div className="flex gap-1 overflow-x-auto flex-1 justify-center ml-4">
          {PROPERTY_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx("top-pill", activeTab === tab.id && "active")}
            >
              <Icon name={tab.icon} className="text-sm" />
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-52 flex-shrink-0 border-r border-surface-muted bg-white overflow-y-auto">
          <div className="px-3 pt-3 pb-1 text-[11px] font-bold text-txt-secondary uppercase tracking-wide">
            Views
          </div>
          <button
            onClick={() => router.push("/")}
            className="sidebar-item"
          >
            <div className="flex items-center gap-2">
              <Icon name="dashboard" className="text-base text-txt-secondary" />
              <span className="text-sm">Dashboard</span>
            </div>
            <span className="text-[10px] text-txt-secondary ml-6">All properties</span>
          </button>
          <div className="px-3 pt-4 pb-1 text-[11px] font-bold text-txt-secondary uppercase tracking-wide">
            {"Properties (" + properties.length + ")"}
          </div>
          {properties.map((p) => (
            <button
              key={p.id}
              onClick={() => router.push(`/property/${p.id}`)}
              className={clsx(
                "sidebar-item",
                p.id === propertyId && "active"
              )}
            >
              <span
                className={clsx(
                  "text-xs leading-snug",
                  p.id === propertyId ? "font-bold" : "font-medium"
                )}
              >
                {p.nickname || p.name}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <StatusBadge status={p.status} />
                {p.price_per_night > 0 && (
                  <span className="text-[10px] text-txt-secondary">
                    {"$" + p.price_per_night + "/n"}
                  </span>
                )}
              </div>
            </button>
          ))}
          <button
            onClick={() => setShowAddModal(true)}
            className="mx-1 my-2 p-2 w-[calc(100%-8px)] border border-dashed border-surface-muted rounded-lg text-txt-secondary text-xs cursor-pointer hover:border-brand hover:text-brand transition-colors"
          >
            + Add Property
          </button>
        </aside>

        <main className="flex-1 overflow-y-auto p-5">
          {activeTab === "overview" && <PropertyHub propertyId={propertyId} />}
          {activeTab === "messages" && (
            <MessagesTab propertyId={propertyId} />
          )}
          {activeTab === "calendar" && property && (
            <CalendarTab property={property} />
          )}
          {activeTab === "vendors" && <VendorsTab />}
          {activeTab === "tasks" && <TasksTab propertyId={propertyId} />}
        </main>
      </div>

      <AddPropertyModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={(id) => router.push(`/property/${id}`)}
      />
    </div>
  );
}
