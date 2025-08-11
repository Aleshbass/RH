'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  Smartphone, 
  Activity, 
  Heart, 
  Footprints,
  Moon,
  Flame,
  Target,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  TrendingUp
} from 'lucide-react'
import { format } from 'date-fns'

interface FitbitIntegrationProps {
  patientId: string;
}

export function FitbitIntegration({ patientId }: FitbitIntegrationProps) {
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  // Mock Fitbit data - replace with actual API calls
  const fitbitData = {
    steps: 8420,
    stepGoal: 10000,
    distance: 3.8, // miles
    caloriesBurned: 2150,
    activeMinutes: 45,
    heartRateZones: {
      fatBurn: 23,
      cardio: 15,
      peak: 7
    },
    sleepData: {
      totalMinutes: 456, // 7h 36m
      efficiency: 87,
      stages: {
        deep: 98,
        light: 245,
        rem: 89,
        wake: 24
      }
    },
    lastSync: Date.now() - 30 * 60 * 1000 // 30 minutes ago
  }

  const handleConnect = async () => {
    setIsConnecting(true)
    // TODO: Implement Fitbit OAuth flow
    // This would redirect to Fitbit's OAuth page
    setTimeout(() => {
      setIsConnected(true)
      setIsConnecting(false)
    }, 2000)
  }

  const handleDisconnect = () => {
    setIsConnected(false)
    // TODO: Implement disconnect logic
  }

  const handleSync = async () => {
    setIsSyncing(true)
    // TODO: Implement sync with Fitbit API
    setTimeout(() => {
      setIsSyncing(false)
    }, 3000)
  }

  const getStepProgress = () => (fitbitData.steps / fitbitData.stepGoal) * 100

  if (!isConnected) {
    return (
      <Card>
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Smartphone className="w-8 h-8 text-green-600" />
          </div>
          <CardTitle>Connect Your Fitbit</CardTitle>
          <CardDescription>
            Sync your activity data, heart rate, sleep patterns, and more to get a complete picture of your health
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <Activity className="h-5 w-5 text-blue-600" />
                <h4 className="font-medium">Activity Tracking</h4>
              </div>
              <p className="text-sm text-gray-600">
                Steps, distance, calories burned, and active minutes
              </p>
            </div>
            
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <Heart className="h-5 w-5 text-red-600" />
                <h4 className="font-medium">Heart Rate</h4>
              </div>
              <p className="text-sm text-gray-600">
                Resting heart rate and heart rate zones
              </p>
            </div>
            
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <Moon className="h-5 w-5 text-purple-600" />
                <h4 className="font-medium">Sleep Tracking</h4>
              </div>
              <p className="text-sm text-gray-600">
                Sleep duration, efficiency, and sleep stages
              </p>
            </div>
            
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <Target className="h-5 w-5 text-green-600" />
                <h4 className="font-medium">Goal Progress</h4>
              </div>
              <p className="text-sm text-gray-600">
                Track progress towards your health goals
              </p>
            </div>
          </div>

          <div className="text-center">
            <Button 
              onClick={handleConnect}
              disabled={isConnecting}
              className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 px-8"
            >
              {isConnecting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Smartphone className="h-4 w-4 mr-2" />
                  Connect Fitbit Account
                </>
              )}
            </Button>
            <p className="text-xs text-gray-500 mt-2">
              You'll be redirected to Fitbit to authorize access
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-full">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-green-900">Fitbit Connected</h3>
                <p className="text-sm text-green-700">
                  Last synced: {format(new Date(fitbitData.lastSync), 'h:mm a')}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSync}
                disabled={isSyncing}
                className="border-green-300 text-green-700 hover:bg-green-50"
              >
                {isSyncing ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleDisconnect}
                className="border-red-300 text-red-700 hover:bg-red-50"
              >
                Disconnect
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Today's Activity */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600">Steps</p>
                <p className="text-2xl font-bold text-blue-900">
                  {fitbitData.steps.toLocaleString()}
                </p>
                <Progress value={getStepProgress()} className="mt-2 h-2" />
                <p className="text-xs text-blue-700 mt-1">
                  {Math.round(getStepProgress())}% of goal
                </p>
              </div>
              <Footprints className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600">Distance</p>
                <p className="text-2xl font-bold text-green-900">
                  {fitbitData.distance} <span className="text-sm">mi</span>
                </p>
                <Badge className="mt-2 bg-green-100 text-green-700">
                  Great job!
                </Badge>
              </div>
              <Target className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-red-50 border-orange-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-orange-600">Calories</p>
                <p className="text-2xl font-bold text-orange-900">
                  {fitbitData.caloriesBurned.toLocaleString()}
                </p>
                <div className="flex items-center mt-2">
                  <TrendingUp className="h-3 w-3 text-orange-600 mr-1" />
                  <span className="text-xs text-orange-700">+12% vs yesterday</span>
                </div>
              </div>
              <Flame className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-600">Active Minutes</p>
                <p className="text-2xl font-bold text-purple-900">
                  {fitbitData.activeMinutes}
                </p>
                <Badge className="mt-2 bg-purple-100 text-purple-700">
                  On track
                </Badge>
              </div>
              <Activity className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Heart Rate Zones */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-red-600" />
            Heart Rate Zones
          </CardTitle>
          <CardDescription>
            Time spent in different heart rate zones today
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-yellow-700">Fat Burn</span>
                <span className="text-lg font-bold text-yellow-900">{fitbitData.heartRateZones.fatBurn}m</span>
              </div>
              <Progress value={60} className="h-2 bg-yellow-100" />
              <p className="text-xs text-yellow-600 mt-1">50-70% max HR</p>
            </div>
            
            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-orange-700">Cardio</span>
                <span className="text-lg font-bold text-orange-900">{fitbitData.heartRateZones.cardio}m</span>
              </div>
              <Progress value={40} className="h-2 bg-orange-100" />
              <p className="text-xs text-orange-600 mt-1">70-85% max HR</p>
            </div>
            
            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-red-700">Peak</span>
                <span className="text-lg font-bold text-red-900">{fitbitData.heartRateZones.peak}m</span>
              </div>
              <Progress value={20} className="h-2 bg-red-100" />
              <p className="text-xs text-red-600 mt-1">85%+ max HR</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sleep Data */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Moon className="h-5 w-5 text-purple-600" />
            Sleep Summary
          </CardTitle>
          <CardDescription>
            Last night's sleep analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium">Total Sleep</span>
                <span className="text-2xl font-bold">
                  {Math.floor(fitbitData.sleepData.totalMinutes / 60)}h {fitbitData.sleepData.totalMinutes % 60}m
                </span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Sleep Efficiency</span>
                <span className="text-lg font-semibold">{fitbitData.sleepData.efficiency}%</span>
              </div>
              <Progress value={fitbitData.sleepData.efficiency} className="h-2" />
              <Badge className="mt-2 bg-green-100 text-green-800">
                Good quality
              </Badge>
            </div>
            
            <div className="space-y-3">
              <h4 className="font-medium">Sleep Stages</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-blue-700">Deep</span>
                  <span className="text-sm font-medium">{Math.floor(fitbitData.sleepData.stages.deep / 60)}h {fitbitData.sleepData.stages.deep % 60}m</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-green-700">Light</span>
                  <span className="text-sm font-medium">{Math.floor(fitbitData.sleepData.stages.light / 60)}h {fitbitData.sleepData.stages.light % 60}m</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-purple-700">REM</span>
                  <span className="text-sm font-medium">{Math.floor(fitbitData.sleepData.stages.rem / 60)}h {fitbitData.sleepData.stages.rem % 60}m</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">Awake</span>
                  <span className="text-sm font-medium">{fitbitData.sleepData.stages.wake}m</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
