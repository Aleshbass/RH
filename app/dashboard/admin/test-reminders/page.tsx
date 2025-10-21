'use client';

import React, { useState } from 'react';
import { useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Play, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  AlertTriangle,
  Database,
  Bell,
  Calendar,
  FileText
} from 'lucide-react';

export default function TestRemindersPage() {
  const [testResults, setTestResults] = useState<any>(null);
  const [dataCheck, setDataCheck] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [individualTest, setIndividualTest] = useState<string | null>(null);

  // @ts-ignore
  const runAllTests = useAction(api.test_reminders.testAllReminders);
  // @ts-ignore
  const checkData = useAction(api.test_reminders.checkTestData);
  // @ts-ignore
  const testExercise = useAction(api.test_reminders.testExerciseReminders);
  // @ts-ignore
  const testInvoice = useAction(api.test_reminders.testInvoiceReminders);
  // @ts-ignore
  const testAppointment = useAction(api.test_reminders.testAppointmentReminders);

  const handleRunAllTests = async () => {
    setLoading(true);
    setTestResults(null);
    try {
      const results = await runAllTests();
      setTestResults(results);
    } catch (e) {
      setTestResults({
        error: (e as Error).message,
        summary: { total: 0, passed: 0, failed: 0 },
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCheckData = async () => {
    setLoading(true);
    setDataCheck(null);
    try {
      const data = await checkData();
      setDataCheck(data);
    } catch (e) {
      setDataCheck({ error: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const handleIndividualTest = async (testType: string) => {
    setLoading(true);
    setIndividualTest(testType);
    setTestResults(null);
    try {
      let result;
      switch (testType) {
        case 'exercise':
          result = await testExercise();
          break;
        case 'invoice':
          result = await testInvoice();
          break;
        case 'appointment':
          result = await testAppointment();
          break;
      }
      setTestResults({
        tests: [{
          name: testType,
          status: result.success ? '✅ PASSED' : '❌ FAILED',
          details: result.result || result.error,
        }],
        summary: {
          total: 1,
          passed: result.success ? 1 : 0,
          failed: result.success ? 0 : 1,
        },
      });
    } catch (e) {
      setTestResults({
        error: (e as Error).message,
        summary: { total: 1, passed: 0, failed: 1 },
      });
    } finally {
      setLoading(false);
      setIndividualTest(null);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reminder System Test Suite</h1>
        <p className="text-muted-foreground mt-2">
          Test all reminder systems to ensure they're wired correctly
        </p>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>Note:</strong> These tests will actually send notifications if data exists. 
          Run in a test environment first.
        </AlertDescription>
      </Alert>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Check Test Data
            </CardTitle>
            <CardDescription>
              Verify if test data exists in the database
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={handleCheckData} 
              disabled={loading}
              className="w-full"
            >
              {loading && !testResults ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Database className="h-4 w-4 mr-2" />
              )}
              Check Data Availability
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-5 w-5" />
              Run All Tests
            </CardTitle>
            <CardDescription>
              Test all reminder systems at once
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={handleRunAllTests} 
              disabled={loading}
              className="w-full"
            >
              {loading && !dataCheck ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Run All Tests
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Individual Tests */}
      <Card>
        <CardHeader>
          <CardTitle>Individual Tests</CardTitle>
          <CardDescription>
            Test each reminder system separately
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              variant="outline"
              onClick={() => handleIndividualTest('exercise')}
              disabled={loading}
              className="h-20 flex-col"
            >
              {loading && individualTest === 'exercise' ? (
                <Loader2 className="h-6 w-6 mb-2 animate-spin" />
              ) : (
                <Bell className="h-6 w-6 mb-2" />
              )}
              <span>Exercise Reminders</span>
            </Button>

            <Button
              variant="outline"
              onClick={() => handleIndividualTest('invoice')}
              disabled={loading}
              className="h-20 flex-col"
            >
              {loading && individualTest === 'invoice' ? (
                <Loader2 className="h-6 w-6 mb-2 animate-spin" />
              ) : (
                <FileText className="h-6 w-6 mb-2" />
              )}
              <span>Invoice Reminders</span>
            </Button>

            <Button
              variant="outline"
              onClick={() => handleIndividualTest('appointment')}
              disabled={loading}
              className="h-20 flex-col"
            >
              {loading && individualTest === 'appointment' ? (
                <Loader2 className="h-6 w-6 mb-2 animate-spin" />
              ) : (
                <Calendar className="h-6 w-6 mb-2" />
              )}
              <span>Appointment Reminders</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Data Check Results */}
      {dataCheck && (
        <Card>
          <CardHeader>
            <CardTitle>Data Availability Check</CardTitle>
          </CardHeader>
          <CardContent>
            {dataCheck.error ? (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>{dataCheck.error}</AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-3xl font-bold">{dataCheck.activePlans}</div>
                    <div className="text-sm text-muted-foreground">Active Plans</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-3xl font-bold">{dataCheck.unpaidInvoices}</div>
                    <div className="text-sm text-muted-foreground">Unpaid Invoices</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-3xl font-bold">{dataCheck.upcomingAppointments}</div>
                    <div className="text-sm text-muted-foreground">Upcoming Appointments</div>
                  </div>
                </div>

                {dataCheck.recommendations && dataCheck.recommendations.length > 0 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="font-semibold mb-2">Recommendations:</div>
                      <ul className="list-disc list-inside space-y-1">
                        {dataCheck.recommendations.map((rec: string, i: number) => (
                          <li key={i} className="text-sm">{rec}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Test Results */}
      {testResults && (
        <Card>
          <CardHeader>
            <CardTitle>Test Results</CardTitle>
            <CardDescription>
              {testResults.timestamp && `Run at: ${new Date(testResults.timestamp).toLocaleString()}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {testResults.error ? (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>{testResults.error}</AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold">{testResults.summary.total}</div>
                    <div className="text-sm text-muted-foreground">Total Tests</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg bg-green-50">
                    <div className="text-2xl font-bold text-green-600">
                      {testResults.summary.passed}
                    </div>
                    <div className="text-sm text-muted-foreground">Passed</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg bg-red-50">
                    <div className="text-2xl font-bold text-red-600">
                      {testResults.summary.failed}
                    </div>
                    <div className="text-sm text-muted-foreground">Failed</div>
                  </div>
                </div>

                {/* Individual Test Results */}
                <div className="space-y-3">
                  {testResults.tests?.map((test: any, i: number) => (
                    <Card key={i}>
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            {test.status.includes('PASSED') ? (
                              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                            ) : (
                              <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                            )}
                            <div>
                              <h4 className="font-semibold">{test.name}</h4>
                              {test.details && (
                                <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto">
                                  {JSON.stringify(test.details, null, 2)}
                                </pre>
                              )}
                              {test.error && (
                                <div className="mt-2 text-sm text-red-600">
                                  Error: {test.error}
                                </div>
                              )}
                            </div>
                          </div>
                          <Badge
                            variant={test.status.includes('PASSED') ? 'default' : 'destructive'}
                          >
                            {test.status}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Final Status */}
                {testResults.summary.failed === 0 ? (
                  <Alert className="bg-green-50 border-green-200">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800">
                      <strong>🎉 All tests passed!</strong> Reminder system is wired correctly.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Some tests failed.</strong> Check the errors above and verify your setup.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
