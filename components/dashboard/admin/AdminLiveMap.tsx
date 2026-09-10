"use client";

import { useState } from "react";
import Map, { Marker, Popup, NavigationControl } from "react-map-gl/mapbox";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { MapPin, User, Navigation, Video, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NIGERIA_CENTER, NIGERIA_BOUNDS } from "@/lib/nigeria-locations";
import { formatDistanceToNow } from "date-fns";

export default function AdminLiveMap() {
  const [selectedPhysio, setSelectedPhysio] = useState<any | null>(null);
  const locations = useQuery(api.locationTracking.getAllActiveLocations);
  
  const [viewState, setViewState] = useState({
    longitude: NIGERIA_CENTER.lng,
    latitude: NIGERIA_CENTER.lat,
    zoom: 5,
  });

  return (
    <Card className="col-span-full h-[600px] flex flex-col shadow-sm border-gray-200">
      <CardHeader className="pb-2 border-b">
        <CardTitle className="text-lg font-bold flex items-center gap-2">
          <Navigation className="h-5 w-5 text-teal-600" />
          Live Physiotherapist Locations
          <span className="ml-auto text-xs bg-teal-100 text-teal-800 px-2 py-1 rounded-full font-medium">
            {locations?.length || 0} Active
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 relative">
        <Map
          {...viewState}
          onMove={(evt) => setViewState(evt.viewState)}
          style={{ width: "100%", height: "100%" }}
          mapStyle="mapbox://styles/mapbox/light-v11"
          mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
        >
          <NavigationControl position="top-right" showCompass={false} />

          {locations?.map((loc: any) => (
            <Marker
              key={loc._id}
              longitude={loc.longitude}
              latitude={loc.latitude}
              anchor="bottom"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setSelectedPhysio(loc);
              }}
            >
              <div className="relative group cursor-pointer flex flex-col items-center">
                <div className={`p-1.5 rounded-full shadow-lg ${
                    loc.status === "in_transit" ? "bg-amber-500" :
                    loc.status === "at_patient" ? "bg-teal-500" : "bg-blue-500"
                }`}>
                  <User className="h-4 w-4 text-white" />
                </div>
                <div className="w-2 h-2 rotate-45 -mt-1 shadow-lg bg-inherit"></div>
              </div>
            </Marker>
          ))}

          {selectedPhysio && (
            <Popup
              longitude={selectedPhysio.longitude}
              latitude={selectedPhysio.latitude}
              anchor="bottom"
              offset={25}
              onClose={() => setSelectedPhysio(null)}
              className="z-10"
              maxWidth="250px"
            >
              <div className="p-1">
                <h3 className="font-bold text-gray-900">{selectedPhysio.physiotherapistName}</h3>
                <p className="text-xs text-gray-500 mb-2 truncate">{selectedPhysio.physiotherapistEmail}</p>
                
                <div className="flex items-center gap-2 text-xs mb-1">
                  <span className={`px-1.5 py-0.5 rounded font-medium ${
                    selectedPhysio.status === "in_transit" ? "bg-amber-100 text-amber-700" :
                    selectedPhysio.status === "at_patient" ? "bg-teal-100 text-teal-700" : "bg-blue-100 text-blue-700"
                  }`}>
                    {selectedPhysio.status === "in_transit" ? "In Transit" :
                     selectedPhysio.status === "at_patient" ? "At Patient" : "Idle"}
                  </span>
                </div>
                
                <div className="flex items-center gap-1 text-xs text-gray-400 mt-2">
                  <Clock className="w-3 h-3" />
                  <span>Updated {formatDistanceToNow(selectedPhysio.lastUpdated)} ago</span>
                </div>
              </div>
            </Popup>
          )}
        </Map>
      </CardContent>
    </Card>
  );
}
