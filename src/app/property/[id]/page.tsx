"use client";

import { useParams } from "next/navigation";
import { PropertyShell } from "@/components/PropertyShell";

export default function PropertyPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  if (!id) return null;
  return <PropertyShell propertyId={id} />;
}
