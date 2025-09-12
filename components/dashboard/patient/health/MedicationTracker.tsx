'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Pill } from '@/components/ui/pill'
import { Clock } from '@/components/ui/clock'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Plus,
  Calendar
} from 'lucide-react'
import { format } from 'date-fns'

type MedicationTrackerProps = object;

export function MedicationTracker({}: MedicationTrackerProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    dosage: '',
    frequency: '',
    instructions: ''
  })

  // Mock data - replace with actual API calls
  const medications = [
    {
      id: '1',
      name: 'Ibuprofen',
      dosage: '400mg',
      frequency: 'Every 8 hours',
      instructions: 'Take with food',
      isActive: true,
      nextDose: Date.now() + 2 * 60 * 60 * 1000, // 2 hours from now
      adherenceRate: 92
    },
    {
      id: '2',
      name: 'Physical Therapy Supplement',
      dosage: '2 tablets',
      frequency: 'Daily',
      instructions: 'Take in the morning',
      isActive: true,
      nextDose: Date.now() + 18 * 60 * 60 * 1000, // 18 hours from now
      adherenceRate: 88
    }
  ]

  const recentLogs = [
    {
      id: '1',
      medicationName: 'Ibuprofen',
      takenAt: Date.now() - 6 * 60 * 60 * 1000, // 6 hours ago
      status: 'taken' as const,
      notes: 'Taken with breakfast'
    },
    {
      id: '2',
      medicationName: 'Physical Therapy Supplement',
      takenAt: Date.now() - 24 * 60 * 60 * 1000, // 1 day ago
      status: 'taken' as const
    },
    {
      id: '3',
      medicationName: 'Ibuprofen',
      takenAt: Date.now() - 30 * 60 * 60 * 1000, // 30 hours ago
      status: 'missed' as const,
      notes: 'Forgot to take'
    }
  ]

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // TODO: Implement API call to add medication
    console.log('Adding medication:', formData)
    setShowAddForm(false)
    setFormData({ name: '', dosage: '', frequency: '', instructions: '' })
  }

  const handleTakeMedication = (medicationId: string) => {
    // TODO: Implement API call to log medication taken
    console.log('Medication taken:', medicationId)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'taken':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />
      case 'missed':
        return <XCircle className="h-4 w-4 text-red-600" />
      case 'delayed':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />
      default:
        return <Clock className="h-4 w-4 text-gray-600" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'taken':
        return 'bg-green-100 text-green-800'
      case 'missed':
        return 'bg-red-100 text-red-800'
      case 'delayed':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const overallAdherence = medications.reduce((acc, med) => acc + med.adherenceRate, 0) / medications.length

  return (
    <div className="space-y-6">
      {/* Adherence Overview */}
      <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-green-900 mb-2">
                Medication Adherence
              </h3>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Progress value={overallAdherence} className="h-3" />
                  <p className="text-sm text-green-700 mt-1">
                    {Math.round(overallAdherence)}% adherence rate
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-green-900">
                    {Math.round(overallAdherence)}%
                  </p>
                  <p className="text-sm text-green-600">This week</p>
                </div>
              </div>
            </div>
            <Pill className="h-12 w-12 text-green-600 ml-4">
              <span className="sr-only">Pill</span>
            </Pill>
          </div>
        </CardContent>
      </Card>

      {/* Current Medications */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Current Medications</CardTitle>
            <CardDescription>
              Your active medication schedule
            </CardDescription>
          </div>
          <Button 
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Medication
          </Button>
        </CardHeader>

        {showAddForm && (
          <CardContent className="border-t">
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Medication Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Ibuprofen"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="dosage">Dosage</Label>
                  <Input
                    id="dosage"
                    placeholder="e.g., 400mg"
                    value={formData.dosage}
                    onChange={(e) => setFormData({...formData, dosage: e.target.value})}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="frequency">Frequency</Label>
                  <Input
                    id="frequency"
                    placeholder="e.g., Every 8 hours"
                    value={formData.frequency}
                    onChange={(e) => setFormData({...formData, frequency: e.target.value})}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="instructions">Instructions</Label>
                  <Input
                    id="instructions"
                    placeholder="e.g., Take with food"
                    value={formData.instructions}
                    onChange={(e) => setFormData({...formData, instructions: e.target.value})}
                  />
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button type="submit" className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700">
                  Add Medication
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        )}

        <CardContent>
          <div className="space-y-4">
            {medications.map((medication) => (
              <div key={medication.id} className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-100 rounded-full">
                      <Pill className="h-5 w-5 text-blue-600">
                        <span className="sr-only">Pill</span>
                      </Pill>
                    </div>
                    <div>
                      <h4 className="font-semibold text-lg">{medication.name}</h4>
                      <p className="text-gray-600">{medication.dosage} • {medication.frequency}</p>
                      {medication.instructions && (
                        <p className="text-sm text-gray-500 mt-1">{medication.instructions}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <Clock className="h-4 w-4 text-gray-500" />
                        <span className="text-sm text-gray-600">
                          Next dose: {format(new Date(medication.nextDose), 'h:mm a')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right space-y-2">
                    <div>
                      <Progress value={medication.adherenceRate} className="w-24 h-2" />
                      <p className="text-xs text-gray-500 mt-1">{medication.adherenceRate}% adherence</p>
                    </div>
                    <Button 
                      size="sm" 
                      onClick={() => handleTakeMedication(medication.id)}
                      className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Take Now
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Medication Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Recent Activity
          </CardTitle>
          <CardDescription>Your medication history</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  {getStatusIcon(log.status)}
                  <div>
                    <p className="font-medium">{log.medicationName}</p>
                    <p className="text-sm text-gray-500">
                      {format(new Date(log.takenAt), 'MMM d, yyyy')} at {format(new Date(log.takenAt), 'h:mm a')}
                    </p>
                    {log.notes && (
                      <p className="text-xs text-gray-400 mt-1">{log.notes}</p>
                    )}
                  </div>
                </div>
                <Badge className={getStatusColor(log.status)}>
                  {log.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
