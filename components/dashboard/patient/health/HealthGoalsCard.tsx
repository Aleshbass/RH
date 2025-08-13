'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { 
  Target, 
  Calendar,
  Plus
} from 'lucide-react'
import { format, addDays } from 'date-fns'

type Props = object;

export function HealthGoalsCard({}: Props) {
  const [showAddForm, setShowAddForm] = useState(false)

  // Mock data - replace with actual API calls
  const healthGoals = [
    {
      id: '1',
      type: 'steps' as const,
      target: 10000,
      current: 8420,
      unit: 'steps',
      deadline: addDays(new Date(), 30).getTime(),
      isActive: true,
      title: 'Daily Steps Goal'
    },
    {
      id: '2',
      type: 'pain_reduction' as const,
      target: 3,
      current: 4,
      unit: 'pain level',
      deadline: addDays(new Date(), 60).getTime(),
      isActive: true,
      title: 'Reduce Pain Level'
    },
    {
      id: '3',
      type: 'medication_adherence' as const,
      target: 95,
      current: 88,
      unit: '%',
      deadline: addDays(new Date(), 14).getTime(),
      isActive: true,
      title: 'Medication Adherence'
    }
  ]

  const getProgressPercentage = (goal: typeof healthGoals[0]) => {
    if (goal.type === 'pain_reduction') {
      // For pain reduction, lower is better, so we calculate differently
      const improvement = Math.max(0, 10 - goal.current)
      const targetImprovement = 10 - goal.target
      return Math.min(100, (improvement / targetImprovement) * 100)
    }
    return Math.min(100, (goal.current / goal.target) * 100)
  }

  const getGoalStatus = (goal: typeof healthGoals[0]) => {
    const progress = getProgressPercentage(goal)
    if (progress >= 100) return { text: 'Achieved', color: 'bg-green-100 text-green-800' }
    if (progress >= 75) return { text: 'On Track', color: 'bg-blue-100 text-blue-800' }
    if (progress >= 50) return { text: 'In Progress', color: 'bg-yellow-100 text-yellow-800' }
    return { text: 'Needs Attention', color: 'bg-red-100 text-red-800' }
  }

  const getGoalIcon = (type: string) => {
    switch (type) {
      case 'steps':
        return '👟'
      case 'pain_reduction':
        return '🎯'
      case 'medication_adherence':
        return '💊'
      case 'weight':
        return '⚖️'
      default:
        return '🎯'
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Health Goals
          </CardTitle>
          <CardDescription>
            Track your progress towards health objectives
          </CardDescription>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Goal
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {healthGoals.map((goal) => {
          const progress = getProgressPercentage(goal)
          const status = getGoalStatus(goal)
          
          return (
            <div key={goal.id} className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getGoalIcon(goal.type)}</span>
                  <div>
                    <h4 className="font-medium">{goal.title}</h4>
                    <p className="text-sm text-gray-600">
                      {goal.type === 'pain_reduction' 
                        ? `Target: ${goal.target}/10 or lower`
                        : `Target: ${goal.target.toLocaleString()} ${goal.unit}`
                      }
                    </p>
                  </div>
                </div>
                <Badge className={status.color}>
                  {status.text}
                </Badge>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Progress</span>
                  <span className="font-medium">
                    {goal.type === 'pain_reduction' 
                      ? `Current: ${goal.current}/10`
                      : `${goal.current.toLocaleString()} / ${goal.target.toLocaleString()} ${goal.unit}`
                    }
                  </span>
                </div>
                <Progress value={progress} className="h-2" />
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{Math.round(progress)}% complete</span>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>Due {format(new Date(goal.deadline), 'MMM d')}</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {healthGoals.length === 0 && (
          <div className="text-center py-8">
            <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Health Goals Set</h3>
            <p className="text-gray-600 mb-4">
              Set health goals to track your progress and stay motivated
            </p>
            <Button onClick={() => setShowAddForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Goal
            </Button>
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">
              {healthGoals.filter(g => getGoalStatus(g).text === 'Achieved').length}
            </p>
            <p className="text-xs text-gray-600">Achieved</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">
              {healthGoals.filter(g => ['On Track', 'In Progress'].includes(getGoalStatus(g).text)).length}
            </p>
            <p className="text-xs text-gray-600">In Progress</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-orange-600">
              {Math.round(healthGoals.reduce((acc, goal) => acc + getProgressPercentage(goal), 0) / healthGoals.length) || 0}%
            </p>
            <p className="text-xs text-gray-600">Avg Progress</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
