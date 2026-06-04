"use client";

import { useState, useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MapPin, Navigation, Signal, SignalLow, SignalZero } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";

export default function LiveLocationTracker() {
  const [isTracking, setIsTracking] = useState(false);
  const [status, setStatus] = useState<"in_transit" | "idle" | "at_patient">("idle");
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [lastPing, setLastPing] = useState<Date | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  
  const pingLocation = useMutation(api.locationTracking.pingLocation);
  const stopTracking = useMutation(api.locationTracking.stopTracking);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Function to actually ping Convex
  const sendPing = (position: GeolocationPosition) => {
    pingLocation({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      status: status,
      accuracy: position.coords.accuracy,
    }).then(() => {
      setLastPing(new Date());
      setErrorMsg("");
    }).catch((err) => {
      console.error("Failed to ping location:", err);
      setErrorMsg("Failed to sync location to server");
    });
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setHasPermission(true);
        setIsTracking(true);
        sendPing(position);
        toast.success("Live tracking enabled. Admins can now see your location.");

        // Set up watchPosition to get updates when moving
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            sendPing(pos);
          },
          (err) => {
            console.error("Watch position error:", err);
          },
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
        );

        // Fallback interval ping every 3 minutes just in case watchPosition doesn't fire
        intervalRef.current = setInterval(() => {
          navigator.geolocation.getCurrentPosition(sendPing);
        }, 3 * 60 * 1000);
      },
      (error) => {
        setHasPermission(false);
        setIsTracking(false);
        toast.error("Please allow location permissions to enable live tracking");
      },
      { enableHighAccuracy: true }
    );
  };

  const handleStopTracking = async () => {
    setIsTracking(false);
    setLastPing(null);
    
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    try {
      await stopTracking();
      toast.info("Live tracking disabled.");
    } catch (e) {
      console.error(e);
    }
  };

  const toggleTracking = (checked: boolean) => {
    if (checked) {
      startTracking();
    } else {
      handleStopTracking();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <Card className="shadow-sm border-gray-200">
      <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${isTracking ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
            <Navigation className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Live Location Tracking</h3>
            <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
              {isTracking ? (
                <>
                  <Signal className="w-3 h-3 text-green-500" />
                  <span>Transmitting</span>
                  {lastPing && <span>• Last updated: {lastPing.toLocaleTimeString()}</span>}
                </>
              ) : (
                <>
                  <SignalZero className="w-3 h-3 text-gray-400" />
                  <span>Offline</span>
                </>
              )}
            </div>
            {errorMsg && <p className="text-xs text-red-500 mt-1">{errorMsg}</p>}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {isTracking && (
            <select
              value={status}
              onChange={(e) => {
                const newStatus = e.target.value as "idle" | "in_transit" | "at_patient";
                setStatus(newStatus);
                if (isTracking) {
                   navigator.geolocation.getCurrentPosition((pos) => {
                      pingLocation({
                        latitude: pos.coords.latitude,
                        longitude: pos.coords.longitude,
                        status: newStatus,
                        accuracy: pos.coords.accuracy,
                      });
                   });
                }
              }}
              className="text-xs bg-gray-50 border border-gray-200 rounded p-1.5 outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="idle">Idle</option>
              <option value="in_transit">In Transit</option>
              <option value="at_patient">At Patient</option>
            </select>
          )}

          <div className="flex items-center space-x-2 border-l border-gray-200 pl-4">
            <Label htmlFor="live-track" className="text-sm cursor-pointer whitespace-nowrap">
              {isTracking ? "On Duty" : "Off Duty"}
            </Label>
            <Switch
              id="live-track"
              checked={isTracking}
              onCheckedChange={toggleTracking}
              className={isTracking ? "data-[state=checked]:bg-green-500" : ""}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
