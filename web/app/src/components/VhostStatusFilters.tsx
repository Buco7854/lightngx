import { useMemo } from "react";
import type { Site } from "../api";
import { useI18n } from "../i18n";
import { XIcon } from "../icons";
import { setQuery, useLocation } from "../router";
import { Combobox, IconBtn } from "../ui";

type Choice = "all" | "true" | "false";
const choice = (value: string | null, fallback: Choice): Choice =>
  value === null ? fallback : value === "true" || value === "false" ? value : "all";

export function useVhostStatus(maintenanceAvailable: boolean) {
  const { searchParams } = useLocation();
  // Keep existing bookmarks working; new filters use independent booleans.
  const legacy = searchParams.get("state");
  const enabled = choice(
    searchParams.get("enabled"),
    legacy === "enabled" || legacy === "maintenance"
      ? "true"
      : legacy === "disabled"
        ? "false"
        : "all",
  );
  const maintenance = maintenanceAvailable
    ? choice(
        searchParams.get("maintenance"),
        legacy === "maintenance" ? "true" : legacy === "enabled" ? "false" : "all",
      )
    : "all";
  return {
    enabled,
    maintenance,
    key: `${enabled}:${maintenance}`,
    active: enabled !== "all" || maintenance !== "all",
    matches: (site: Site) =>
      (enabled === "all" || site.enabled === (enabled === "true")) &&
      (maintenance === "all" || site.maintenance === (maintenance === "true")),
    set: (field: "enabled" | "maintenance", value: string) => {
      const nextEnabled = field === "enabled" ? value : enabled;
      const nextMaintenance = field === "maintenance" ? value : maintenance;
      setQuery({
        state: null,
        enabled: nextEnabled === "all" ? null : nextEnabled,
        maintenance: nextMaintenance === "all" ? null : nextMaintenance,
      });
    },
    clear: () => setQuery({ state: null, enabled: null, maintenance: null }),
  };
}

export default function VhostStatusFilters({
  sites,
  maintenanceAvailable,
  filters,
}: {
  sites: Site[];
  maintenanceAvailable: boolean;
  filters: ReturnType<typeof useVhostStatus>;
}) {
  const { t } = useI18n();
  const counts = useMemo(
    () =>
      sites.reduce(
        (acc, site) => ({
          enabled: acc.enabled + Number(site.enabled),
          maintenance: acc.maintenance + Number(site.maintenance),
        }),
        { enabled: 0, maintenance: 0 },
      ),
    [sites],
  );
  return (
    <div className="status-filter-fields flex max-w-full items-end gap-2.5">
      <div className="min-w-0 flex-1 space-y-1">
        <span className="block text-[11px] font-medium text-dim">{t.colEnabled}</span>
        <Combobox
          ariaLabel={t.filterEnabled}
          value={filters.enabled}
          onChange={(value) => filters.set("enabled", value)}
          className="w-[145px] max-w-full"
          options={[
            { value: "all", label: `${t.filterAll} (${sites.length})` },
            { value: "true", label: `${t.filterEnabled} (${counts.enabled})` },
            { value: "false", label: `${t.filterDisabled} (${sites.length - counts.enabled})` },
          ]}
        />
      </div>
      {maintenanceAvailable && (
        <div className="min-w-0 flex-1 space-y-1">
          <span className="block text-[11px] font-medium text-dim">{t.colMaintenance}</span>
          <Combobox
            ariaLabel={t.filterMaintenance}
            value={filters.maintenance}
            onChange={(value) => filters.set("maintenance", value)}
            className="w-[145px] max-w-full"
            options={[
              { value: "all", label: `${t.filterAll} (${sites.length})` },
              { value: "true", label: `${t.statusOn} (${counts.maintenance})` },
              { value: "false", label: `${t.statusOff} (${sites.length - counts.maintenance})` },
            ]}
          />
        </div>
      )}
      {filters.active && (
        <IconBtn
          type="button"
          size="sm"
          aria-label={t.clearStatusFilters}
          title={t.clearStatusFilters}
          onClick={filters.clear}
          className="status-filter-clear mb-1 shrink-0"
        >
          <XIcon size={14} />
        </IconBtn>
      )}
    </div>
  );
}
