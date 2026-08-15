// @ts-nocheck
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Loader2, MapPin, Wifi, Building2, Globe } from "lucide-react";

export default function AdminTransactionsPage() {
  const transactions = useQuery(api.admin.getMarketplaceTransactions);

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Marketplace Transactions</h1>
        <p className="text-muted-foreground mt-1">View all payments and invoices for marketplace bookings.</p>
      </div>

      {transactions === undefined ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : transactions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-64 text-center">
            <p className="text-muted-foreground text-lg mb-2">No transactions found</p>
            <p className="text-sm text-muted-foreground">Marketplace payments will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Patient Info</TableHead>
                  <TableHead>Physiotherapist</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ref</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx._id}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(tx.issueDate || 0).toLocaleDateString()}
                      <div className="text-xs text-muted-foreground">
                        {new Date(tx.issueDate || 0).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{tx.patientName}</span>
                        {(tx as any).isGuest && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] bg-purple-50 text-purple-600 border border-purple-200 rounded-full px-1.5 py-0.5 font-medium">
                            <Globe className="h-2.5 w-2.5" /> Guest
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{tx.patientEmail}</div>
                      {tx.patientPhone && (
                        <div className="text-xs text-muted-foreground">{tx.patientPhone}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{tx.physiotherapistName}</div>
                      <div className="text-xs text-muted-foreground">{tx.physiotherapistEmail}</div>
                      {/* Location */}
                      {((tx as any).physioLocation || (tx as any).physioOffersOnline || (tx as any).physioOffersInPerson) && (
                        <div className="flex flex-wrap items-center gap-1 mt-0.5">
                          {(tx as any).physioLocation && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-500">
                              <MapPin className="h-3 w-3 text-teal-500" />
                              {(tx as any).physioLocation}
                            </span>
                          )}
                          {(tx as any).physioOffersOnline && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] bg-blue-50 text-blue-600 border border-blue-100 rounded-full px-1.5 py-0.5">
                              <Wifi className="h-2.5 w-2.5" /> Online
                            </span>
                          )}
                          {(tx as any).physioOffersInPerson && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] bg-gray-50 text-gray-600 border border-gray-200 rounded-full px-1.5 py-0.5">
                              <Building2 className="h-2.5 w-2.5" /> In-person
                            </span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{formatCurrency(tx.totalAmount / 100, tx.currency)}</div>
                      <div className="text-xs text-muted-foreground">
                        Fees: {formatCurrency(tx.platformFeeAmount / 100, tx.currency)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={tx.status === "paid" ? "default" : "secondary"}>
                        {tx.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-[120px] truncate">
                      {tx.paymentReference}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}

