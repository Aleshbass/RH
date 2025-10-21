'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  BarChart3, 
  TrendingUp, 
  Download,
  Users,
  DollarSign,
  Activity,
  Clock,
  Target,
  Award
} from 'lucide-react'

interface PerformanceMetrics {
  averageRating: number;
  totalReviews: number;
  patientRetentionRate: number;
  averageSessionsPerPatient: number;
  staffUtilization: number;
  patientSatisfaction: number;
  treatmentSuccess: number;
  avgSessionDuration: number;
  revenueGrowth: number;
}

export default function ClinicReportsPage() {
  const reportsData = useQuery(api.clinics.getClinicReports)
  const performanceMetrics = useQuery(api.clinics.getClinicPerformanceMetrics) as PerformanceMetrics | undefined
  const appointmentStats = useQuery(api.clinics.getClinicAppointmentStats)
  const staffMetrics = useQuery(api.clinics.getStaffMetrics)

  if (reportsData === undefined || performanceMetrics === undefined || appointmentStats === undefined || staffMetrics === undefined) {
    return (
      <div className="p-8">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 md:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Reports & Analytics</h1>
            <p className="text-gray-600">Track clinic performance and generate insights</p>
          </div>
          <Button>
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>

        {/* Key Metrics Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Patient Satisfaction</CardTitle>
              <Award className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{performanceMetrics?.patientSatisfaction || 0}%</div>
              <p className="text-xs text-muted-foreground">Based on patient feedback</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Treatment Success</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{performanceMetrics?.treatmentSuccess || 0}%</div>
              <p className="text-xs text-muted-foreground">Treatment outcomes</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Session Duration</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{performanceMetrics?.avgSessionDuration || 0}min</div>
              <p className="text-xs text-muted-foreground">Optimal range</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Revenue Growth</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">+{performanceMetrics?.revenueGrowth || 0}%</div>
              <p className="text-xs text-muted-foreground">Month over month</p>
            </CardContent>
          </Card>
        </div>

        {/* Reports Tabs */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="financial">Financial</TabsTrigger>
            <TabsTrigger value="clinical">Clinical</TabsTrigger>
            <TabsTrigger value="operational">Operational</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Monthly Performance</CardTitle>
                  <CardDescription>Key metrics over the last 6 months</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
                    <div className="text-center">
                      <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">Chart visualization would go here</p>
                      <p className="text-sm text-gray-500">Patient visits, revenue, satisfaction trends</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Patient Demographics</CardTitle>
                  <CardDescription>Age and condition distribution</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">18-30 years</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${reportsData?.demographics?.['18-30'] || 0}%` }}></div>
                        </div>
                        <span className="text-sm text-gray-600">{reportsData?.demographics?.['18-30'] || 0}%</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">31-50 years</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${reportsData?.demographics?.['31-50'] || 0}%` }}></div>
                        </div>
                        <span className="text-sm text-gray-600">{reportsData?.demographics?.['31-50'] || 0}%</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">51-70 years</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${reportsData?.demographics?.['51-70'] || 0}%` }}></div>
                        </div>
                        <span className="text-sm text-gray-600">{reportsData?.demographics?.['51-70'] || 0}%</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">70+ years</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${reportsData?.demographics?.['70+'] || 0}%` }}></div>
                        </div>
                        <span className="text-sm text-gray-600">{reportsData?.demographics?.['70+'] || 0}%</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="financial">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Revenue Breakdown</CardTitle>
                  <CardDescription>Income sources and trends</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {reportsData && reportsData.revenueBreakdown && (reportsData.revenueBreakdown.individualSessions + reportsData.revenueBreakdown.insuranceClaims + reportsData.revenueBreakdown.packageDeals) > 0 ? (
                      <>
                        <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium">Individual Sessions</p>
                            <p className="text-sm text-gray-600">Direct patient payments</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-green-600">₦{(reportsData.revenueBreakdown.individualSessions / 100).toLocaleString()}</p>
                            <p className="text-sm text-gray-600">{Math.round((reportsData.revenueBreakdown.individualSessions / (reportsData.revenueBreakdown.individualSessions + reportsData.revenueBreakdown.insuranceClaims + reportsData.revenueBreakdown.packageDeals)) * 100)}%</p>
                          </div>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium">Insurance Claims</p>
                            <p className="text-sm text-gray-600">Insurance reimbursements</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-green-600">₦{(reportsData.revenueBreakdown.insuranceClaims / 100).toLocaleString()}</p>
                            <p className="text-sm text-gray-600">{reportsData.revenueBreakdown.insuranceClaims > 0 ? Math.round((reportsData.revenueBreakdown.insuranceClaims / (reportsData.revenueBreakdown.individualSessions + reportsData.revenueBreakdown.insuranceClaims + reportsData.revenueBreakdown.packageDeals)) * 100) : 0}%</p>
                          </div>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium">Package Deals</p>
                            <p className="text-sm text-gray-600">Multi-session packages</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-green-600">₦{(reportsData.revenueBreakdown.packageDeals / 100).toLocaleString()}</p>
                            <p className="text-sm text-gray-600">{reportsData.revenueBreakdown.packageDeals > 0 ? Math.round((reportsData.revenueBreakdown.packageDeals / (reportsData.revenueBreakdown.individualSessions + reportsData.revenueBreakdown.insuranceClaims + reportsData.revenueBreakdown.packageDeals)) * 100) : 0}%</p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-gray-600">No revenue data yet</p>
                        <p className="text-sm text-gray-500">Revenue will appear once payments are received</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Expense Analysis</CardTitle>
                  <CardDescription>Cost breakdown and optimization</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
                    <div className="text-center">
                      <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">Expense chart would go here</p>
                      <p className="text-sm text-gray-500">Staff, equipment, utilities breakdown</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="clinical">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Treatment Outcomes</CardTitle>
                  <CardDescription>Success rates by condition type</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Back Pain</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div className="bg-green-600 h-2 rounded-full" style={{ width: '85%' }}></div>
                        </div>
                        <span className="text-sm text-gray-600">85%</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Knee Injuries</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div className="bg-green-600 h-2 rounded-full" style={{ width: '78%' }}></div>
                        </div>
                        <span className="text-sm text-gray-600">78%</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Shoulder Issues</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div className="bg-green-600 h-2 rounded-full" style={{ width: '72%' }}></div>
                        </div>
                        <span className="text-sm text-gray-600">72%</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Post-Surgery</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div className="bg-green-600 h-2 rounded-full" style={{ width: '90%' }}></div>
                        </div>
                        <span className="text-sm text-gray-600">90%</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Patient Progress</CardTitle>
                  <CardDescription>Average improvement metrics</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
                    <div className="text-center">
                      <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">Progress tracking chart</p>
                      <p className="text-sm text-gray-500">Pain reduction, mobility improvement</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="operational">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Appointment Analytics</CardTitle>
                  <CardDescription>Scheduling patterns and efficiency</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium">Average Daily Appointments</p>
                        <p className="text-sm text-gray-600">Per therapist</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{reportsData?.avgDailyAppointments || 0}</p>
                        <p className="text-sm text-gray-500">This month</p>
                      </div>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium">No-Show Rate</p>
                        <p className="text-sm text-gray-600">Missed appointments</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{appointmentStats?.noShows || 0}</p>
                        <p className="text-sm text-red-600">No-shows this month</p>
                      </div>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium">Utilization Rate</p>
                        <p className="text-sm text-gray-600">Capacity usage</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{staffMetrics?.utilization || 0}%</p>
                        <p className="text-sm text-green-600">Current rate</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Staff Performance</CardTitle>
                  <CardDescription>Productivity and patient feedback</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
                    <div className="text-center">
                      <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">Staff metrics chart</p>
                      <p className="text-sm text-gray-500">Individual performance tracking</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
