'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { 
  AlertCircle, 
  TrendingUp, 
  Plus,
  MapPin,
  Clock,
  Activity
} from '@/components/icons'
import { format } from 'date-fns'

type SymptomLoggerProps = object; // Use 'object' type for any object, not empty interface

export function SymptomLogger({}: SymptomLoggerProps) {
  const [showPainForm, setShowPainForm] = useState(false)
  const [showSymptomForm, setShowSymptomForm] = useState(false)
  const [painLevel, setPainLevel] = useState([3])
  const [symptomSeverity, setSymptomSeverity] = useState([5])
  
  const [painFormData, setPainFormData] = useState({
    location: '',
    description: '',
    activities: ''
  })
  
  const [symptomFormData, setSymptomFormData] = useState({
    type: '',
    description: '',
    triggers: ''
  })

  // Mock data - replace with actual API calls
  const recentPainLogs = [
    {
      id: '1',
      painLevel: 4,
      location: 'Lower back',
      description: 'Sharp pain when bending',
      activities: ['sitting', 'bending'],
      loggedAt: Date.now() - 2 * 60 * 60 * 1000 // 2 hours ago
    },
    {
      id: '2',
      painLevel: 2,
      location: 'Right knee',
      description: 'Mild stiffness',
      activities: ['walking', 'stairs'],
      loggedAt: Date.now() - 6 * 60 * 60 * 1000 // 6 hours ago
    }
  ]

  const recentSymptomLogs = [
    {
      id: '1',
      symptomType: 'Fatigue',
      severity: 6,
      description: 'Feeling tired after light exercise',
      triggers: ['exercise', 'stress'],
      loggedAt: Date.now() - 4 * 60 * 60 * 1000 // 4 hours ago
    },
    {
      id: '2',
      symptomType: 'Headache',
      severity: 3,
      description: 'Mild tension headache',
      triggers: ['screen time'],
      loggedAt: Date.now() - 12 * 60 * 60 * 1000 // 12 hours ago
    }
  ]

  const handlePainSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // TODO: Implement API call to save pain log
    console.log('Saving pain log:', { ...painFormData, painLevel: painLevel[0] })
    setShowPainForm(false)
    setPainFormData({ location: '', description: '', activities: '' })
    setPainLevel([3])
  }

  const handleSymptomSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // TODO: Implement API call to save symptom log
    console.log('Saving symptom log:', { ...symptomFormData, severity: symptomSeverity[0] })
    setShowSymptomForm(false)
    setSymptomFormData({ type: '', description: '', triggers: '' })
    setSymptomSeverity([5])
  }

  const getPainLevelColor = (level: number) => {
    if (level <= 3) return 'text-green-600 bg-green-100'
    if (level <= 6) return 'text-yellow-600 bg-yellow-100'
    return 'text-red-600 bg-red-100'
  }

  const getPainLevelText = (level: number) => {
    if (level <= 3) return 'Mild'
    if (level <= 6) return 'Moderate'
    return 'Severe'
  }

  const averagePainLevel = recentPainLogs.reduce((acc, log) => acc + log.painLevel, 0) / recentPainLogs.length

  return (
    <div className="space-y-6">
      {/* Pain & Symptom Overview */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-gradient-to-br from-orange-50 to-red-50 border-orange-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-orange-600">Average Pain Level</p>
                <p className="text-3xl font-bold text-orange-900">
                  {averagePainLevel.toFixed(1)}/10
                </p>
                <Badge className={`mt-2 ${getPainLevelColor(averagePainLevel)}`}>
                  {getPainLevelText(averagePainLevel)}
                </Badge>
              </div>
              <AlertCircle className="h-10 w-10 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-600">Symptoms Tracked</p>
                <p className="text-3xl font-bold text-purple-900">
                  {recentSymptomLogs.length}
                </p>
                <p className="text-sm text-purple-600 mt-2">This week</p>
              </div>
              <TrendingUp className="h-10 w-10 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Log Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              Log Pain Level
            </CardTitle>
            <CardDescription>
              Track your current pain intensity and location
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => setShowPainForm(!showPainForm)}
              className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
            >
              <Plus className="h-4 w-4 mr-2" />
              Record Pain
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-purple-600" />
              Log Symptoms
            </CardTitle>
            <CardDescription>
              Record other symptoms you&apos;re experiencing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => setShowSymptomForm(!showSymptomForm)}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              <Plus className="h-4 w-4 mr-2" />
              Record Symptom
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Pain Logging Form */}
      {showPainForm && (
        <Card>
          <CardHeader>
            <CardTitle>Record Pain Level</CardTitle>
            <CardDescription>
              Help us track your pain patterns for better treatment
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePainSubmit} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-medium">Pain Level: {painLevel[0]}/10</Label>
                  <div className="mt-3">
                    <Slider
                      value={painLevel}
                      onValueChange={setPainLevel}
                      max={10}
                      min={0}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>No pain</span>
                      <span>Mild</span>
                      <span>Moderate</span>
                      <span>Severe</span>
                      <span>Worst possible</span>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="location">Pain Location</Label>
                    <Input
                      id="location"
                      placeholder="e.g., Lower back, Right knee"
                      value={painFormData.location}
                      onChange={(e) => setPainFormData({...painFormData, location: e.target.value})}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="activities">Related Activities</Label>
                    <Input
                      id="activities"
                      placeholder="e.g., walking, sitting, bending"
                      value={painFormData.activities}
                      onChange={(e) => setPainFormData({...painFormData, activities: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe the pain (sharp, dull, throbbing, etc.)"
                    value={painFormData.description}
                    onChange={(e) => setPainFormData({...painFormData, description: e.target.value})}
                    rows={3}
                  />
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button type="submit" className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600">
                  Save Pain Log
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowPainForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Symptom Logging Form */}
      {showSymptomForm && (
        <Card>
          <CardHeader>
            <CardTitle>Record Symptom</CardTitle>
            <CardDescription>
              Track symptoms to help identify patterns and triggers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSymptomSubmit} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-medium">Severity: {symptomSeverity[0]}/10</Label>
                  <div className="mt-3">
                    <Slider
                      value={symptomSeverity}
                      onValueChange={setSymptomSeverity}
                      max={10}
                      min={1}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>Very mild</span>
                      <span>Mild</span>
                      <span>Moderate</span>
                      <span>Severe</span>
                      <span>Very severe</span>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="type">Symptom Type</Label>
                    <Input
                      id="type"
                      placeholder="e.g., Headache, Fatigue, Nausea"
                      value={symptomFormData.type}
                      onChange={(e) => setSymptomFormData({...symptomFormData, type: e.target.value})}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="triggers">Possible Triggers</Label>
                    <Input
                      id="triggers"
                      placeholder="e.g., stress, food, weather"
                      value={symptomFormData.triggers}
                      onChange={(e) => setSymptomFormData({...symptomFormData, triggers: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="symptomDescription">Description</Label>
                  <Textarea
                    id="symptomDescription"
                    placeholder="Describe the symptom and how it affects you"
                    value={symptomFormData.description}
                    onChange={(e) => setSymptomFormData({...symptomFormData, description: e.target.value})}
                    rows={3}
                  />
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button type="submit" className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
                  Save Symptom Log
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowSymptomForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Recent Pain Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Recent Pain Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentPainLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-orange-100 rounded-full">
                    <MapPin className="h-4 w-4 text-orange-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{log.location}</p>
                      <Badge className={getPainLevelColor(log.painLevel)}>
                        {log.painLevel}/10
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{log.description}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Clock className="h-3 w-3 text-gray-400" />
                      <span className="text-xs text-gray-500">
                        {format(new Date(log.loggedAt), 'MMM d, h:mm a')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Symptom Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Symptoms
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentSymptomLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-purple-100 rounded-full">
                    <Activity className="h-4 w-4 text-purple-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{log.symptomType}</p>
                      <Badge className="bg-purple-100 text-purple-800">
                        {log.severity}/10
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{log.description}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Clock className="h-3 w-3 text-gray-400" />
                      <span className="text-xs text-gray-500">
                        {format(new Date(log.loggedAt), 'MMM d, h:mm a')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
