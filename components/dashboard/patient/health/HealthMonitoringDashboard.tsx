'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  Heart, 
  Activity, 
  Pill, 
  TrendingUp, 
  Calendar,
  Smartphone,
  Target,
  AlertCircle,
  CheckCircle2
} from 'lucide-react'
import { VitalSignsCard } from './VitalSignsCard'
import { MedicationTracker } from './MedicationTracker'
import { SymptomLogger } from './SymptomLogger'
import { FitbitIntegration } from './FitbitIntegration'
import { HealthGoalsCard } from './HealthGoalsCard'

export function HealthMonitoringDashboard() {
  const [activeTab, setActiveTab] = useState('overview')

  // Mock data for demonstration - replace with actual API calls
  const healthStats = {
    todaySteps: 8420,
    stepGoal: 10000,
    avgHeartRate: 72,
    medicationAdherence: 85,
    painLevel: 3,
    lastSync: new Date().toISOString()
  }

  const quickActions = [
    {
      title: 'Log Pain Level',
      description: 'Track your current pain',
      icon: AlertCircle,
      color: 'bg-red-50 text-red-600 border-red-200',
      action: () => setActiveTab('symptoms')
    },
    {
      title: 'Record Vitals',
      description: 'Add vital signs manually',
      icon: Heart,
      color: 'bg-pink-50 text-pink-600 border-pink-200',
      action: () => setActiveTab('vitals')
    },
    {
      title: 'Log Medication',
      description: 'Mark medication as taken',
      icon: Pill,
      color: 'bg-blue-50 text-blue-600 border-blue-200',
      action: () => setActiveTab('medications')
    },
    {
      title: 'Sync Fitbit',
      description: 'Update activity data',
      icon: Smartphone,
      color: 'bg-green-50 text-green-600 border-green-200',
      action: () => setActiveTab('fitbit')
    }
  ]

  return (
    <div className="space-y-6">
      {/* Header with Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600">Daily Steps</p>
                <p className="text-2xl font-bold text-blue-900">
                  {healthStats.todaySteps.toLocaleString()}
                </p>
                <Progress 
                  value={(healthStats.todaySteps / healthStats.stepGoal) * 100} 
                  className="mt-2 h-2"
                />
              </div>
              <Activity className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-pink-50 to-pink-100 border-pink-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-pink-600">Avg Heart Rate</p>
                <p className="text-2xl font-bold text-pink-900">
                  {healthStats.avgHeartRate} <span className="text-sm">bpm</span>
                </p>
                <Badge variant="secondary" className="mt-2 bg-pink-100 text-pink-700">
                  Normal
                </Badge>
              </div>
              <Heart className="h-8 w-8 text-pink-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600">Medication</p>
                <p className="text-2xl font-bold text-green-900">
                  {healthStats.medicationAdherence}%
                </p>
                <div className="flex items-center mt-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mr-1" />
                  <span className="text-sm text-green-700">On track</span>
                </div>
              </div>
              <Pill className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-orange-600">Pain Level</p>
                <p className="text-2xl font-bold text-orange-900">
                  {healthStats.painLevel}/10
                </p>
                <Badge 
                  variant="secondary" 
                  className="mt-2 bg-orange-100 text-orange-700"
                >
                  Mild
                </Badge>
              </div>
              <TrendingUp className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Quick Actions
          </CardTitle>
          <CardDescription>
            Common health tracking activities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {quickActions.map((action, index) => (
              <Button
                key={index}
                variant="outline"
                className={`h-auto p-4 flex flex-col items-start gap-2 ${action.color} hover:opacity-80 transition-all duration-200`}
                onClick={action.action}
              >
                <action.icon className="h-6 w-6" />
                <div className="text-left">
                  <p className="font-medium">{action.title}</p>
                  <p className="text-xs opacity-70">{action.description}</p>
                </div>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Detailed Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="vitals">Vitals</TabsTrigger>
          <TabsTrigger value="medications">Medications</TabsTrigger>
          <TabsTrigger value="symptoms">Symptoms</TabsTrigger>
          <TabsTrigger value="fitbit">Fitbit</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <HealthGoalsCard />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="text-sm font-medium">Medication taken</p>
                      <p className="text-xs text-gray-500">2 hours ago</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                    <Activity className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="text-sm font-medium">8,420 steps recorded</p>
                      <p className="text-xs text-gray-500">Today</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-pink-50 rounded-lg">
                    <Heart className="h-5 w-5 text-pink-600" />
                    <div>
                      <p className="text-sm font-medium">Vitals recorded</p>
                      <p className="text-xs text-gray-500">This morning</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="vitals">
          <VitalSignsCard />
        </TabsContent>

        <TabsContent value="medications">
          <MedicationTracker />
        </TabsContent>

        <TabsContent value="symptoms">
          <SymptomLogger />
        </TabsContent>

        <TabsContent value="fitbit">
          <FitbitIntegration />
        </TabsContent>
      </Tabs>
    </div>
  )
}
