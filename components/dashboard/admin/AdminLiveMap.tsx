"use client";

import { useState } from "react";
import Map, { Marker, Popup, NavigationControl } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { User, Clock } from "@/components/icons";
import { formatDistanceToNow } from "date-fns";
import { NIGERIA_CENTER } from "@/lib/nigeria-locations";
import { Panel, StatusBadge } from "@/components/admin/ui";
import { useClinicTheme } from "@/components/clinic/ClinicTheme";

type LiveLocation = {
  _id: string;
  longitude: number;
  latitude: number;
  status?: string;
  physiotherapistName?: string;
  physiotherapistEmail?: string;
  lastUpdated: number;
};

const STATUS = {
  in_transit: { label: "In transit", pin: "bg-amber-500", tone: "amber" as const },
  at_patient: { label: "At patient", pin: "bg-rh-teal dark:bg-rh-aqua", tone: "teal" as const },
  idle: { label: "Idle", pin: "bg-neutral-500", tone: "neutral" as const },
};

function statusOf(status?: string) {
  return status === "in_transit" ? STATUS.in_transit : status === "at_patient" ? STATUS.at_patient : STATUS.idle;
}

export default function AdminLiveMap() {
  const [selected, setSelected] = useState<LiveLocation | null>(null);
  const locations = useQuery(api.locationTracking.getAllActiveLocations) as LiveLocation[] | undefined;
  const { theme } = useClinicTheme();
  const hasToken = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);

  const [viewState, setViewState] = useState({
    longitude: NIGERIA_CENTER.lng,
    latitude: NIGERIA_CENTER.lat,
    zoom: 5,
  });

  return (
    <Panel
      title="Live physiotherapist locations"
      description="Physios sharing their location during home visits"
      actions={<StatusBadge tone={locations?.length ? "teal" : "neutral"}>{locations?.length ?? 0} active</StatusBadge>}
      bodyClassName="px-3 pb-3 pt-2"
    >
      <div className="relative h-[420px] overflow-hidden rounded-xl bg-rh-mist dark:bg-rh-ink-3 sm:h-[520px]">
        {hasToken ? (
          <Map
            {...viewState}
            onMove={(evt) => setViewState(evt.viewState)}
            style={{ width: "100%", height: "100%" }}
            mapStyle={theme === "dark" ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11"}
            mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
          >
            <NavigationControl position="top-right" showCompass={false} />

            {locations?.map((loc) => (
              <Marker
                key={loc._id}
                longitude={loc.longitude}
                latitude={loc.latitude}
                anchor="bottom"
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  setSelected(loc);
                }}
              >
                <div className="flex cursor-pointer flex-col items-center">
                  <div className={`rounded-full p-1.5 shadow-lg ring-2 ring-white dark:ring-rh-ink ${statusOf(loc.status).pin}`}>
                    <User className="h-4 w-4 text-white" />
                  </div>
                </div>
              </Marker>
            ))}

            {selected && (
              <Popup
                longitude={selected.longitude}
                latitude={selected.latitude}
                anchor="bottom"
                offset={25}
                onClose={() => setSelected(null)}
                className="z-10"
                maxWidth="250px"
              >
                <div className="p-1 text-neutral-900">
                  <h3 className="font-semibold">{selected.physiotherapistName ?? "Physiotherapist"}</h3>
                  {selected.physiotherapistEmail && (
                    <p className="mb-2 truncate text-xs text-neutral-500">{selected.physiotherapistEmail}</p>
                  )}
                  <StatusBadge tone={statusOf(selected.status).tone}>{statusOf(selected.status).label}</StatusBadge>
                  <div className="mt-2 flex items-center gap-1 text-xs text-neutral-500">
                    <Clock className="h-3 w-3" />
                    <span>Updated {formatDistanceToNow(selected.lastUpdated, { addSuffix: true })}</span>
                  </div>
                </div>
              </Popup>
            )}
          </Map>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
            The map needs NEXT_PUBLIC_MAPBOX_TOKEN to be set.
          </div>
        )}
      </div>
    </Panel>
  );
}
