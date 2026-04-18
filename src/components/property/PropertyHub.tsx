"use client";

import { useState } from "react";
import clsx from "clsx";
import { useProperty, usePropertyDetails } from "@/lib/hooks";
import { Icon } from "@/components/Icon";
import { HousePlaceholder } from "@/components/HousePlaceholder";
import { OverviewCard } from "@/components/property/cards/OverviewCard";
import { AccessLocksCard } from "@/components/property/cards/AccessLocksCard";
import { WifiTechCard } from "@/components/property/cards/WifiTechCard";
import { ListingsCard } from "@/components/property/cards/ListingsCard";
import { PricingRulesCard } from "@/components/property/cards/PricingRulesCard";
import { NotesCard } from "@/components/property/cards/NotesCard";
import { ArrivalFlowCard } from "@/components/property/cards/ArrivalFlowCard";
import { DepartureFlowCard } from "@/components/property/cards/DepartureFlowCard";

type SubTab = "operations" | "business";

export function PropertyHub({ propertyId }: { propertyId: string }) {
  const { data: property, loading, refetch } = useProperty(propertyId);
  const { bySection, save } = usePropertyDetails(propertyId);
  const [tab, setTab] = useState<SubTab>("operations");

  if (loading) {
    return <p className="text-txt-secondary text-sm">Loading property…</p>;
  }
  if (!property) {
    return (
      <div className="max-w-xl">
        <p className="text-txt-secondary text-sm">Property not found.</p>
      </div>
    );
  }

  const photo = property.primary_photo_url;
  const stats = [
    property.bedrooms ? `${property.bedrooms}bd` : null,
    property.bathrooms ? `${property.bathrooms}ba` : null,
    property.max_guests ? `sleeps ${property.max_guests}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const listings = bySection["listings"] as
    | { rows?: Array<{ platform: string }> }
    | undefined;
  const platforms =
    listings?.rows?.map((r) => r.platform).filter(Boolean) || [];

  return (
    <div className="max-w-6xl">
      {/* Hero */}
      <div className="bg-white/70 backdrop-blur-xl border border-surface-muted rounded-2xl overflow-hidden mb-5 flex flex-col md:flex-row">
        <div className="md:w-64 flex-shrink-0 bg-gradient-to-br from-surface-soft to-surface-muted flex items-center justify-center relative">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt={property.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <HousePlaceholder className="w-44 h-44 opacity-90" />
          )}
        </div>
        <div className="flex-1 p-5">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold truncate">
                {property.name || "Untitled property"}
              </h1>
              {property.nickname && (
                <p className="text-xs text-txt-tertiary mt-0.5">
                  {property.nickname}
                </p>
              )}
              <p className="text-sm text-txt-secondary mt-1">
                {property.address || "No address yet"}
              </p>
              {stats && (
                <p className="text-xs text-txt-secondary mt-2">{stats}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            <span
              className={clsx(
                "text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide",
                property.status === "listed"
                  ? "bg-status-green-bg text-status-green"
                  : property.status === "snoozed"
                  ? "bg-status-orange-bg text-status-orange"
                  : "bg-surface-soft text-txt-tertiary"
              )}
            >
              {property.status || "unlisted"}
            </span>
            {platforms.length > 0 && (
              <div className="flex gap-1">
                {platforms.map((p, i) => (
                  <span
                    key={i}
                    className="text-[10px] font-semibold bg-brand/10 text-brand px-2 py-0.5 rounded"
                  >
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1.5 mb-4">
        <TabButton active={tab === "operations"} onClick={() => setTab("operations")}>
          <Icon name="handyman" className="text-base" /> Operations
        </TabButton>
        <TabButton active={tab === "business"} onClick={() => setTab("business")}>
          <Icon name="business_center" className="text-base" /> Business
        </TabButton>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tab === "operations" && (
          <>
            <OverviewCard property={property} onUpdated={refetch} />
            <AccessLocksCard data={bySection["access_and_locks"]} onSave={save} />
            <WifiTechCard data={bySection["wifi_and_tech"]} onSave={save} />
            <NotesCard
              icon="menu_book"
              title="House Manual"
              section="house_manual"
              data={bySection["house_manual"]}
              placeholder="Breaker panel location, HVAC quirks, appliance oddities, things that break often, troubleshooting notes…"
              onSave={save}
            />
            <ArrivalFlowCard data={bySection["arrival_flow"]} onSave={save} />
            <DepartureFlowCard
              data={bySection["departure_flow"]}
              onSave={save}
            />
            <NotesCard
              icon="rule"
              title="House Rules"
              section="house_rules"
              data={bySection["house_rules"]}
              placeholder="Smoking / pets / events / quiet hours / guest count limits…"
              onSave={save}
            />
            <NotesCard
              icon="blender"
              title="Amenities & Equipment"
              section="amenities_equipment"
              data={bySection["amenities_equipment"]}
              placeholder="Appliance list with model numbers, warranty dates, service history…"
              onSave={save}
            />
            <NotesCard
              icon="emergency"
              title="Emergency Contacts"
              section="emergency_contacts"
              data={bySection["emergency_contacts"]}
              placeholder="Nearest hospital, police non-emergency, preferred plumber / electrician / locksmith / HVAC…"
              onSave={save}
            />
          </>
        )}

        {tab === "business" && (
          <>
            <ListingsCard data={bySection["listings"]} onSave={save} />
            <PricingRulesCard data={bySection["pricing_rules"]} onSave={save} />
            <NotesCard
              icon="account_balance"
              title="Ownership & Legal"
              section="ownership_legal"
              data={bySection["ownership_legal"]}
              placeholder="Owning LLC, EIN, owner name(s), mortgage lender / account, insurance provider / policy / contact…"
              onSave={save}
            />
            <NotesCard
              icon="bolt"
              title="Utilities"
              section="utilities"
              data={bySection["utilities"]}
              placeholder={
                "Electric — PECO, acct 1234, billed autopay ~$180/mo\nGas — PGW, acct 5678…\nWater — City, acct 9012…\nInternet — Spectrum, $90/mo…"
              }
              onSave={save}
            />
            <NotesCard
              icon="apartment"
              title="HOA"
              section="hoa"
              data={bySection["hoa"]}
              placeholder="HOA name, dues, management company, portal URL, known rules…"
              onSave={save}
            />
            <NotesCard
              icon="engineering"
              title="Vendors"
              section="vendors_summary"
              data={bySection["vendors_summary"]}
              placeholder="Cleaner, handyman, landscaper, pest, pool. Company name + contact + rate. Full vendor management lives in the Vendors tab."
              onSave={save}
            />
            <NotesCard
              icon="description"
              title="Documents"
              section="documents"
              data={bySection["documents"]}
              placeholder="Lease, deed, insurance policy, permits, licenses. File upload support (Supabase Storage) coming soon — for now paste URLs or notes."
              onSave={save}
            />
            <NotesCard
              icon="payments"
              title="Financials"
              section="financials"
              data={bySection["financials"]}
              placeholder="Revenue and expenses will be derived from tagged emails once tagging ships. For now, add manual summaries here."
              onSave={save}
            />
          </>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold border cursor-pointer transition-colors",
        active
          ? "border-brand bg-brand/10 text-brand"
          : "border-surface-muted bg-white/60 text-txt-secondary hover:border-txt-secondary"
      )}
    >
      {children}
    </button>
  );
}
