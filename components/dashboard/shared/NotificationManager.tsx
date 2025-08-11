'use client'

import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useState } from "react"
import { toast } from "sonner"
import { Bell, AlertCircle, Clock, XCircle, Trash2, RefreshCw } from "lucide-react"

export function NotificationManager() {
  const [isLoading, setIsLoading] = useState(false)
  
  // Get retry queue statistics
  const retryStats = useQuery(api.notifications.getRetryQueueStats)
  
  // Mutations
  const cleanupQueues = useMutation(api.notifications.cleanupRetryQueues)
  const processRetries = useMutation(api.notifications.processRetryQueuesWithRateLimit)

  const handleCleanup = async () => {
    setIsLoading(true)
    try {
      const result = await cleanupQueues({})
      toast.success(`Cleanup completed. Deleted ${result.deletedCount} old entries.`)
    } catch (error) {
      toast.error("Failed to cleanup retry queues")
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleProcessRetries = async () => {
    setIsLoading(true)
    try {
      const result = await processRetries({ batchSize: 20 })
      if (result.success) {
        toast.success(`Processed ${result.processedCount} retry entries successfully`)
      } else {
        toast.warning(`Processed ${result.processedCount} entries with ${result.errorCount} errors`)
      }
    } catch (error) {
      toast.error("Failed to process retry queues")
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500'
      case 'processing': return 'bg-blue-500'
      case 'completed': return 'bg-green-500'
      case 'failed': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  if (!retryStats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification System
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <RefreshCw className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    )
  }

  const totalPending = retryStats.notificationRetryQueue.pending + retryStats.emailRetryQueue.pending
  const totalFailed = retryStats.notificationRetryQueue.failed + retryStats.emailRetryQueue.failed
  const totalOverdue = retryStats.notificationRetryQueue.overdue + retryStats.emailRetryQueue.overdue

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification System Overview
          </CardTitle>
          <CardDescription>
            Monitor and manage the notification system health
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-600">Total Notifications</p>
                  <p className="text-2xl font-bold text-blue-900">{retryStats.totalNotifications}</p>
                </div>
                <Bell className="h-8 w-8 text-blue-500" />
              </div>
            </div>
            
            <div className="bg-yellow-50 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-yellow-600">Pending Retries</p>
                  <p className="text-2xl font-bold text-yellow-900">{totalPending}</p>
                </div>
                <Clock className="h-8 w-8 text-yellow-500" />
              </div>
            </div>
            
            <div className="bg-red-50 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-red-600">Failed</p>
                  <p className="text-2xl font-bold text-red-900">{totalFailed}</p>
                </div>
                <XCircle className="h-8 w-8 text-red-500" />
              </div>
            </div>
            
            <div className="bg-orange-50 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-orange-600">Overdue</p>
                  <p className="text-2xl font-bold text-orange-900">{totalOverdue}</p>
                </div>
                <AlertCircle className="h-8 w-8 text-orange-500" />
              </div>
            </div>
          </div>

          {(totalOverdue > 0 || totalFailed > 10) && (
            <Alert className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {totalOverdue > 0 && `${totalOverdue} retries are overdue. `}
                {totalFailed > 10 && `${totalFailed} retries have failed and may need attention.`}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-4">
            <Button 
              onClick={handleProcessRetries}
              disabled={isLoading || totalPending === 0}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Process Pending Retries
            </Button>
            
            <Button 
              onClick={handleCleanup}
              disabled={isLoading}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Cleanup Old Entries
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Retry Queue Details</CardTitle>
          <CardDescription>
            Detailed breakdown of notification and email retry queues
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="notifications" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="notifications">Notification Retries</TabsTrigger>
              <TabsTrigger value="emails">Email Retries</TabsTrigger>
            </TabsList>
            
            <TabsContent value="notifications" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {Object.entries(retryStats.notificationRetryQueue).map(([status, count]) => (
                  <div key={status} className="text-center">
                    <Badge variant="outline" className={`w-full justify-center ${getStatusColor(status)} text-white`}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </Badge>
                    <p className="text-2xl font-bold mt-2">{String(count)}</p>
                  </div>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="emails" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {Object.entries(retryStats.emailRetryQueue).map(([status, count]) => (
                  <div key={status} className="text-center">
                    <Badge variant="outline" className={`w-full justify-center ${getStatusColor(status)} text-white`}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </Badge>
                    <p className="text-2xl font-bold mt-2">{String(count)}</p>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
} 