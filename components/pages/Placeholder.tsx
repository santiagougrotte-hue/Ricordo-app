"use client";

import { PageHeader, EmptyState } from "@/components/ui";
import { NAV_LABELS } from "@/lib/nav";
import { useRouter } from "@/lib/nav-context";

export function Placeholder() {
  const { page } = useRouter();
  return (
    <div>
      <PageHeader title={NAV_LABELS[page] ?? page} />
      <EmptyState icon="🚧" text="Módulo en construcción." />
    </div>
  );
}
