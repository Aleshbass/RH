'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { 
  Heart, 
  Thermometer, 
  Weight, 
  Activity,
  Plus,
  TrendingDown
} from '@/components/icons'
import { format } from 'date-fns'

type VitalSignsCardProps = object; // Use 'object' type for any object, not empty interface

export function VitalSignsCard({}: VitalSignsCardProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [formData, setFormData] = useState({
    heartRate: '',
    systolic: '',
    diastolic: '',
    temperature: '',
    weight: '',
    oxygenSaturation: ''
  })

  // Mock data - replace with actual API calls
  const recentVitals = [
    {
      id: '1',
      heartRate: 72,
      bloodPressure: { systolic: 120, diastolic: 80 },
      temperature: 98.6,
      weight: 165,
      oxygenSaturation: 98,
      recordedAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
      source: 'manual' as const
    },
    {
      id: '2',
      heartRate: 68,
      bloodPressure: { systolic: 118, diastolic: 78 },
      temperature: 98.4,
      weight: 164.5,
      oxygenSaturation: 99,
      recordedAt: Date.now() - 24 * 60 * 60 * 1000, // 1 day ago
      source: 'fitbit' as const
    }
  ]

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // TODO: Implement API call to save vitals
    console.log('Saving vitals:', formData)
    setShowAddForm(false)
    setFormData({
      heartRate: '',
      systolic: '',
      diastolic: '',
      temperature: '',
      weight: '',
      oxygenSaturation: ''
    })
  }

  const getVitalStatus = (type: string, value: number) => {
    switch (type) {
      case 'heartRate':
        if (value < 60) return { status: 'Low', color: 'bg-yellow-100 text-yellow-800' }
        if (value > 100) return { status: 'High', color: 'bg-red-100 text-red-800' }
        return { status: 'Normal', color: 'bg-green-100 text-green-800' }
      case 'systolic':
        if (value < 90) return { status: 'Low', color: 'bg-yellow-100 text-yellow-800' }
        if (value > 140) return { status: 'High', color: 'bg-red-100 text-red-800' }
        return { status: 'Normal', color: 'bg-green-100 text-green-800' }
      case 'temperature':
        if (value < 97) return { status: 'Low', color: 'bg-blue-100 text-blue-800' }
        if (value > 99.5) return { status: 'High', color: 'bg-red-100 text-red-800' }
        return { status: 'Normal', color: 'bg-green-100 text-green-800' }
      default:
        return { status: 'Normal', color: 'bg-green-100 text-green-800' }
    }
  }

  return (
    <div className="space-y-6">
      {/* Current Vitals Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-red-50 to-pink-50 border-red-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-600">Heart Rate</p>
                <p className="text-xl font-bold text-red-900">
                  {recentVitals[0]?.heartRate || '--'} <span className="text-sm">bpm</span>
                </p>
                <Badge className={getVitalStatus('heartRate', recentVitals[0]?.heartRate || 0).color}>
                  {getVitalStatus('heartRate', recentVitals[0]?.heartRate || 0).status}
                </Badge>
              </div>
              <Heart className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600">Blood Pressure</p>
                <p className="text-xl font-bold text-blue-900">
                  {recentVitals[0]?.bloodPressure ? 
                    `${recentVitals[0].bloodPressure.systolic}/${recentVitals[0].bloodPressure.diastolic}` : 
                    '--/--'
                  }
                </p>
                <Badge className={getVitalStatus('systolic', recentVitals[0]?.bloodPressure?.systolic || 0).color}>
                  {getVitalStatus('systolic', recentVitals[0]?.bloodPressure?.systolic || 0).status}
                </Badge>
              </div>
              <Activity className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-yellow-50 border-orange-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-orange-600">Temperature</p>
                <p className="text-xl font-bold text-orange-900">
                  {recentVitals[0]?.temperature || '--'}°F
                </p>
                <Badge className={getVitalStatus('temperature', recentVitals[0]?.temperature || 0).color}>
                  {getVitalStatus('temperature', recentVitals[0]?.temperature || 0).status}
                </Badge>
              </div>
              <Thermometer className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-600">Weight</p>
                <p className="text-xl font-bold text-purple-900">
                  {recentVitals[0]?.weight || '--'} <span className="text-sm">lbs</span>
                </p>
                <div className="flex items-center mt-1">
                  <TrendingDown className="h-3 w-3 text-green-600 mr-1" />
                  <span className="text-xs text-green-600">-0.5 lbs</span>
                </div>
              </div>
              <Weight className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add New Vitals */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Record Vital Signs</CardTitle>
            <CardDescription>
              Manually log your vital signs or sync from connected devices
            </CardDescription>
          </div>
          <Button 
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Vitals
          </Button>
        </CardHeader>
        
        {showAddForm && (
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="heartRate">Heart Rate (bpm)</Label>
                  <Input
                    id="heartRate"
                    type="number"
                    placeholder="72"
                    value={formData.heartRate}
                    onChange={(e) => setFormData({...formData, heartRate: e.target.value})}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="systolic">Systolic BP</Label>
                  <Input
                    id="systolic"
                    type="number"
                    placeholder="120"
                    value={formData.systolic}
                    onChange={(e) => setFormData({...formData, systolic: e.target.value})}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="diastolic">Diastolic BP</Label>
                  <Input
                    id="diastolic"
                    type="number"
                    placeholder="80"
                    value={formData.diastolic}
                    onChange={(e) => setFormData({...formData, diastolic: e.target.value})}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="temperature">Temperature (°F)</Label>
                  <Input
                    id="temperature"
                    type="number"
                    step="0.1"
                    placeholder="98.6"
                    value={formData.temperature}
                    onChange={(e) => setFormData({...formData, temperature: e.target.value})}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="weight">Weight (lbs)</Label>
                  <Input
                    id="weight"
                    type="number"
                    step="0.1"
                    placeholder="165"
                    value={formData.weight}
                    onChange={(e) => setFormData({...formData, weight: e.target.value})}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="oxygenSaturation">Oxygen Saturation (%)</Label>
                  <Input
                    id="oxygenSaturation"
                    type="number"
                    placeholder="98"
                    value={formData.oxygenSaturation}
                    onChange={(e) => setFormData({...formData, oxygenSaturation: e.target.value})}
                  />
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button type="submit" className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700">
                  Save Vitals
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        )}
      </Card>

      {/* Recent Vitals History */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Measurements</CardTitle>
          <CardDescription>Your vital signs history</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentVitals.map((vital) => (
              <div key={vital.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-blue-100 rounded-full">
                    <Heart className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium">
                      {format(new Date(vital.recordedAt), 'MMM d, yyyy')} at {format(new Date(vital.recordedAt), 'h:mm a')}
                    </p>
                    <div className="flex gap-4 text-sm text-gray-600 mt-1">
                      <span>HR: {vital.heartRate} bpm</span>
                      <span>BP: {vital.bloodPressure.systolic}/{vital.bloodPressure.diastolic}</span>
                      <span>Temp: {vital.temperature}°F</span>
                      <span>Weight: {vital.weight} lbs</span>
                    </div>
                  </div>
                </div>
                <Badge variant={vital.source === 'fitbit' ? 'default' : 'secondary'}>
                  {vital.source}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
