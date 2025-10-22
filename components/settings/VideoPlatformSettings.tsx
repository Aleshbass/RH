"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Video, ExternalLink, Loader2, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function VideoPlatformSettings() {
  const currentUser = useQuery(api.users.getMyUser);
  const updatePreference = useMutation(api.physiotherapistProfiles.updateVideoPlatformPreference);
  
  const [selectedPlatform, setSelectedPlatform] = useState<"stream" | "google_meet">("stream");
  const [isSaving, setIsSaving] = useState(false);

  // Get current preference
  const currentPreference = currentUser?.physiotherapistProfile?.videoPlatformPreference || "stream";

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updatePreference({ platform: selectedPlatform });
      toast.success("Video platform preference updated", {
        description: `Your appointments will now use ${selectedPlatform === 'stream' ? 'built-in video calls' : 'Google Meet'}`
      });
    } catch (error: any) {
      toast.error("Failed to update preference", {
        description: error.message || "Please try again"
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!currentUser || currentUser.role !== "physiotherapist") {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Video className="h-5 w-5 text-blue-600" />
          Video Call Platform
        </CardTitle>
        <CardDescription>
          Choose your preferred platform for telehealth appointments
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Video rooms will be automatically created when you schedule telehealth appointments
          </AlertDescription>
        </Alert>

        <RadioGroup 
          value={selectedPlatform} 
          onValueChange={(value) => setSelectedPlatform(value as "stream" | "google_meet")}
          defaultValue={currentPreference}
        >
          <div className="space-y-4">
            {/* Built-in Stream Video */}
            <div className="flex items-start space-x-3 p-4 rounded-lg border-2 border-gray-200 hover:border-blue-500 transition-colors cursor-pointer">
              <RadioGroupItem value="stream" id="stream" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="stream" className="cursor-pointer">
                  <div className="flex items-center gap-2 mb-1">
                    <Video className="h-4 w-4 text-blue-600" />
                    <span className="font-semibold">Built-in Video Calls</span>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Recommended</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Professional video calls with recording, screen sharing, and chat built into the platform
                  </p>
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-green-600">✓ No external accounts needed</p>
                    <p className="text-xs text-green-600">✓ Integrated with patient records</p>
                    <p className="text-xs text-green-600">✓ Recording & screen sharing</p>
                    <p className="text-xs text-green-600">✓ Built-in chat during calls</p>
                  </div>
                </Label>
              </div>
            </div>

            {/* Google Meet */}
            <div className="flex items-start space-x-3 p-4 rounded-lg border-2 border-gray-200 hover:border-blue-500 transition-colors cursor-pointer">
              <RadioGroupItem value="google_meet" id="google_meet" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="google_meet" className="cursor-pointer">
                  <div className="flex items-center gap-2 mb-1">
                    <ExternalLink className="h-4 w-4 text-purple-600" />
                    <span className="font-semibold">Google Meet</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Use Google Meet for your telehealth appointments
                  </p>
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-blue-600">✓ Familiar Google interface</p>
                    <p className="text-xs text-blue-600">✓ Calendar integration</p>
                    <p className="text-xs text-gray-500">⚠ Requires Google account</p>
                    <p className="text-xs text-gray-500">⚠ External platform</p>
                  </div>
                </Label>
              </div>
            </div>
          </div>
        </RadioGroup>

        <div className="flex items-center justify-between pt-4 border-t">
          <p className="text-sm text-gray-600">
            Current: <span className="font-semibold">
              {currentPreference === 'stream' ? 'Built-in Video Calls' : 'Google Meet'}
            </span>
          </p>
          <Button 
            onClick={handleSave}
            disabled={isSaving || selectedPlatform === currentPreference}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Preference'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
