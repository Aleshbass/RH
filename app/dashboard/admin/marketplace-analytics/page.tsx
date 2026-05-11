"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Loader2, DollarSign, Users, TrendingUp, Star, AlertTriangle, Package } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function AdminMarketplaceAnalyticsPage() {
  const analytics = useQuery(api.admin.marketplaceEarnings.getPlatformMarketplaceAnalytics);
  const earnings = useQuery(api.admin.marketplaceEarnings.getAllPhysiotherapistEarnings, {
    timeframe: "all_time",
    sortBy: "earnings_desc",
    limit: 20,
  });
  const reports = useQuery(api.marketplace.reports.getAllReports, {
    limit: 10,
  });

  if (analytics === undefined || earnings === undefined || reports === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#005b57]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Marketplace Analytics</h1>
        <p className="text-gray-600 mt-2">
          Platform-wide earnings, physiotherapist performance, and patient reports
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₦{analytics.revenue.total.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Platform fees: ₦{analytics.revenue.platformFees.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Physiotherapists</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.physiotherapists.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {analytics.physiotherapists.available} available on marketplace
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.bookings.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {analytics.bookings.completed} completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Rating</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analytics.reviews.averageRating.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {analytics.reviews.total} total reviews
            </p>
          </CardContent>
        </Card>

        {/* Package Revenue card */}
        <Card className="border-l-4 border-l-teal-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Package Revenue</CardTitle>
            <Package className="h-4 w-4 text-teal-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-teal-700">
              ₦{(analytics.packages?.packageRevenue ?? 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {analytics.packages?.totalPackageBookings ?? 0} package bookings · avg {analytics.packages?.avgPackageSize ?? 0} sessions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="earnings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="earnings">Physiotherapist Earnings</TabsTrigger>
          <TabsTrigger value="packages">Package Bookings</TabsTrigger>
          <TabsTrigger value="reports">
            Patient Reports
            {reports.reports.filter((r: any) => r.status === "pending").length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {reports.reports.filter((r: any) => r.status === "pending").length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Earnings Tab */}
        <TabsContent value="earnings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Earning Physiotherapists</CardTitle>
              <CardDescription>
                Total: {earnings.physiotherapists.length} physiotherapists
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Physiotherapist</TableHead>
                    <TableHead>Patients</TableHead>
                    <TableHead>Bookings</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead className="text-right">Earnings</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {earnings.physiotherapists.map((physio: any) => (
                    <TableRow key={physio.physiotherapistId}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage src={physio.imageUrl} />
                            <AvatarFallback>
                              {physio.name
                                .split(" ")
                                .map((n: string) => n[0])
                                .join("")}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{physio.name}</div>
                            <div className="text-sm text-gray-500">{physio.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{physio.totalPatients}</TableCell>
                      <TableCell>{physio.totalBookings}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                          <span>{physio.averageRating.toFixed(1)}</span>
                          <span className="text-sm text-gray-500">
                            ({physio.reviewCount})
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        ₦{physio.totalEarnings.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Packages Tab */}
        <TabsContent value="packages" className="space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="bg-teal-50 border-teal-200">
              <CardContent className="pt-5">
                <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-1">Package Revenue</p>
                <p className="text-2xl font-bold text-teal-800">₦{(analytics.packages?.packageRevenue ?? 0).toLocaleString()}</p>
                <p className="text-xs text-teal-600 mt-0.5">{analytics.packages?.totalPackageBookings ?? 0} package bookings</p>
              </CardContent>
            </Card>
            <Card className="bg-gray-50">
              <CardContent className="pt-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Single-Session Revenue</p>
                <p className="text-2xl font-bold text-gray-800">₦{(analytics.packages?.singleRevenue ?? 0).toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-0.5">{analytics.packages?.totalSingleBookings ?? 0} single sessions</p>
              </CardContent>
            </Card>
            <Card className="bg-amber-50 border-amber-200">
              <CardContent className="pt-5">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Avg Package Size</p>
                <p className="text-2xl font-bold text-amber-800">{analytics.packages?.avgPackageSize ?? 0} sessions</p>
                <p className="text-xs text-amber-600 mt-0.5">per package booking</p>
              </CardContent>
            </Card>
          </div>

          {/* Recent package bookings table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-teal-600" />
                Recent Package Bookings
              </CardTitle>
              <CardDescription>Latest 5 confirmed package purchases</CardDescription>
            </CardHeader>
            <CardContent>
              {(analytics.packages?.recentPackageBookings ?? []).length === 0 ? (
                <p className="text-center text-gray-500 py-8">No package bookings yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Physiotherapist</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Package</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(analytics.packages?.recentPackageBookings ?? []).map((pkg: any) => (
                      <TableRow key={pkg.bookingId}>
                        <TableCell className="font-medium">{pkg.patientName}</TableCell>
                        <TableCell className="text-gray-600">{pkg.physioName}</TableCell>
                        <TableCell>
                          <span className="text-sm text-gray-700">{pkg.conditionLabel}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-teal-300 text-teal-700">
                            {pkg.packageSessions}-Session
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-teal-500 rounded-full"
                                style={{ width: `${Math.round(((pkg.packageSessions - pkg.sessionsRemaining) / pkg.packageSessions) * 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500">{pkg.sessionsRemaining} left</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          ₦{pkg.totalAmount.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                Patient Reports
              </CardTitle>
              <CardDescription>
                Recent reports from patients about physiotherapists
              </CardDescription>
            </CardHeader>
            <CardContent>
              {reports.reports.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No reports submitted</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Physiotherapist</TableHead>
                      <TableHead>Reporter</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reports.reports.map((report: any) => (
                      <TableRow key={report._id}>
                        <TableCell>
                          <div className="font-medium">
                            {report.physiotherapist?.name || "Unknown"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">
                              {report.reporter?.name || "Unknown"}
                            </div>
                            <div className="text-sm text-gray-500">
                              {report.reporter?.role}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {report.reason.replace(/_/g, " ")}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              report.severity === "critical" || report.severity === "high"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {report.severity}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              report.status === "pending"
                                ? "default"
                                : report.status === "resolved"
                                ? "secondary"
                                : "outline"
                            }
                          >
                            {report.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(report.createdAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
