"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProperties } from "@/lib/hooks";
import { supabase, type Property } from "@/lib/supabase";
import { HousePlaceholder } from "@/components/HousePlaceholder";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui";
import { AddPropertyModal } from "@/components/modals/AddPropertyModal";

type PropertyPlatforms = Record<string, string[]>;

export function ListingsTab() {
  const router = useRouter();
  const { data: properties, loading, refetch } = useProperties();
  const [showAdd, setShowAdd] = useState(false);
  const [platformMap, setPlatformMap] = useState<PropertyPlatforms>({});

  useEffect(() => {
    if (properties.length === 0) return;
    (async () => {
      const ids = properties.map((p) => p.id);
      const { data } = await supabase
        .from("property_details")
        .select("property_id, section, data")
        .in("property_id", ids)
        .eq("section", "listings");
      const map: PropertyPlatforms = {};
      (data || []).forEach((row) => {
        const rows = (row.data as { rows?: Array<{ platform: string }> })?.rows || [];
        map[row.property_id as string] = rows
          .map((r) => r.platform)
          .filter(Boolean);
      });
      setPlatformMap(map);
    })();
  }, [properties]);

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-extrabold flex items-center gap-2">
            <Icon name="holiday_village" className="text-2xl text-txt-secondary" />
            Listings
          </h2>
          <p className="text-xs text-txt-secondary mt-0.5">
            {properties.length} {properties.length === 1 ? "property" : "properties"}
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          + Add Property
        </Button>
      </div>

      {loading && (
        <p className="text-txt-secondary text-sm">Loading…</p>
      )}

      {!loading && properties.length === 0 && (
        <div className="bg-white/70 backdrop-blur-xl border border-dashed border-surface-muted rounded-2xl p-10 text-center">
          <HousePlaceholder className="w-24 h-24 mx-auto opacity-80" />
          <p className="text-sm text-txt-secondary mt-3">
            No properties yet. Add your first one to get started.
          </p>
          <Button className="mt-3" onClick={() => setShowAdd(true)}>
            + Add Property
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {properties.map((p) => (
          <PropertyGridCard
            key={p.id}
            property={p}
            platforms={platformMap[p.id] || []}
            onClick={() => router.push(`/property/${p.id}`)}
          />
        ))}
      </div>

      <AddPropertyModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={(id) => {
          refetch();
          router.push(`/property/${id}`);
        }}
      />
    </div>
  );
}

function PropertyGridCard({
  property,
  platforms,
  onClick,
}: {
  property: Property;
  platforms: string[];
  onClick: () => void;
}) {
  const photo = property.primary_photo_url;
  const statusCls =
    property.status === "listed"
      ? "bg-status-green-bg text-status-green"
      : property.status === "snoozed"
      ? "bg-status-orange-bg text-status-orange"
      : "bg-surface-soft text-txt-tertiary";
  const statusLabel = property.archived
    ? "Archived"
    : property.status === "listed"
    ? "Listed"
    : property.status === "snoozed"
    ? "Paused"
    : "Unlisted";

  return (
    <button
      onClick={onClick}
      className="group flex flex-col bg-white/70 backdrop-blur-xl border border-surface-muted rounded-2xl overflow-hidden text-left cursor-pointer hover:border-brand hover:shadow-md transition-all"
    >
      <div className="aspect-[16/10] bg-gradient-to-br from-surface-soft to-surface-muted flex items-center justify-center">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={property.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <HousePlaceholder className="w-28 h-28 opacity-90" />
        )}
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-bold text-sm truncate">{property.name}</div>
            {property.nickname && (
              <div className="text-[11px] text-txt-tertiary truncate">
                {property.nickname}
              </div>
            )}
          </div>
          <span
            className={
              "text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0 " +
              statusCls
            }
          >
            {statusLabel}
          </span>
        </div>
        <div className="text-xs text-txt-secondary mt-1 truncate">
          {property.address || "No address set"}
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="text-[11px] text-txt-secondary">
            {[
              property.bedrooms ? `${property.bedrooms}bd` : null,
              property.bathrooms ? `${property.bathrooms}ba` : null,
              property.max_guests ? `sleeps ${property.max_guests}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </div>
          {platforms.length > 0 && (
            <div className="flex gap-1">
              {platforms.slice(0, 4).map((pl, i) => (
                <span
                  key={i}
                  className="text-[9px] font-semibold bg-brand/10 text-brand px-1.5 py-0.5 rounded"
                  title={pl}
                >
                  {pl.substring(0, 3)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
