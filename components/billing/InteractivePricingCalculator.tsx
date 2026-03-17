"use client";

import React, { useState, useEffect } from "react";
import { formatNaira, calculateSessionPrice, calculatePackagePrice, calculateSessionFees, INITIAL_ASSESSMENT_FEE, AWADOC_FEE } from "@/lib/pricing";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Calculator, Sparkles, Receipt, Info } from "lucide-react";
import { motion } from "framer-motion";

export function InteractivePricingCalculator() {
    const [locationTier, setLocationTier] = useState<number>(2); // Default to Tier 2 (Major Cities)
    const [conditionLevel, setConditionLevel] = useState<string>("standard");
    const [expertiseLevel, setExpertiseLevel] = useState<string>("standard");
    const [sessionCount, setSessionCount] = useState<number>(1);

    // Calculate live price based on selections
    const sessionRate = calculateSessionPrice(
        locationTier as Readonly<1 | 2 | 3 | 4>,
        conditionLevel as "standard" | "moderate" | "complex",
        expertiseLevel as "standard" | "senior" | "consultant"
    ).sessionRate;

    // Calculate fees for a single session
    const fees = calculateSessionFees(sessionRate);

    // Calculate package pricing
    const discountPercent = sessionCount >= 12 ? 15 : sessionCount >= 8 ? 10 : sessionCount >= 4 ? 5 : 0;
    const packageTotal = calculatePackagePrice(sessionRate, sessionCount, discountPercent).packageTotal;

    return (
        <Card className="w-full max-w-4xl mx-auto shadow-xl border-teal-100 bg-white/50 backdrop-blur-xl mb-24 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                <Calculator className="w-64 h-64 text-teal-900" />
            </div>
            <CardHeader className="bg-gradient-to-r from-[#002B29] to-teal-900 text-white rounded-t-xl pb-8 relative z-10">
                <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-5 h-5 text-teal-400" />
                    <p className="text-teal-300 text-sm font-semibold uppercase tracking-wider">Live Estimate</p>
                </div>
                <CardTitle className="text-3xl">Interactive Price Calculator</CardTitle>
                <CardDescription className="text-teal-50 text-base">
                    Adjust the parameters below to instantly see an estimate of your session costs.
                </CardDescription>
            </CardHeader>

            <CardContent className="pt-8 grid md:grid-cols-2 gap-8 relative z-10">
                {/* Controls Column */}
                <div className="space-y-6">
                    <div className="space-y-3">
                        <Label className="text-base font-semibold text-gray-800">1. Practice Location</Label>
                        <Select value={locationTier.toString()} onValueChange={(v) => setLocationTier(Number(v))}>
                            <SelectTrigger className="h-12 bg-white">
                                <SelectValue placeholder="Select location tier" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="1">Premium (Ikoyi, Wuse 2, etc.)</SelectItem>
                                <SelectItem value="2">Major Cities (Ikeja, Yaba, Central Abuja)</SelectItem>
                                <SelectItem value="3">Secondary Cities (PH, Ibadan, Enugu)</SelectItem>
                                <SelectItem value="4">Standard (Other locations)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-3">
                        <Label className="text-base font-semibold text-gray-800">2. Medical Condition</Label>
                        <Select value={conditionLevel} onValueChange={setConditionLevel}>
                            <SelectTrigger className="h-12 bg-white">
                                <SelectValue placeholder="Select condition complexity" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="standard">Standard (Back pain, sprains)</SelectItem>
                                <SelectItem value="moderate">Advanced (Post-surgery, sports)</SelectItem>
                                <SelectItem value="complex">Neurological (Stroke, CP)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-3">
                        <Label className="text-base font-semibold text-gray-800">3. Specialist Expertise</Label>
                        <Select value={expertiseLevel} onValueChange={setExpertiseLevel}>
                            <SelectTrigger className="h-12 bg-white">
                                <SelectValue placeholder="Select physiotherapist level" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="standard">Standard Physio (1-4 years)</SelectItem>
                                <SelectItem value="senior">Senior Physio (5-10 years)</SelectItem>
                                <SelectItem value="consultant">Consultant (10+ years)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-3 pt-4 border-t border-gray-100">
                        <Label className="text-base font-semibold text-gray-800 flex items-center gap-2">
                            4. Number of Sessions
                            {sessionCount >= 4 && <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-bold ml-auto">{discountPercent}% Discount Active</span>}
                        </Label>
                        <Select value={sessionCount.toString()} onValueChange={(v) => setSessionCount(Number(v))}>
                            <SelectTrigger className="h-12 bg-white">
                                <SelectValue placeholder="Select package size" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="1">1 Session (Evaluation only)</SelectItem>
                                <SelectItem value="4">4 Sessions (Starter Plan)</SelectItem>
                                <SelectItem value="8">8 Sessions (Complete Plan)</SelectItem>
                                <SelectItem value="12">12 Sessions (Full Recovery Plan)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Results Column */}
                <div className="bg-gray-50/80 rounded-2xl p-6 border border-gray-200 shadow-sm flex flex-col h-full">
                    <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-200">
                        <Receipt className="w-5 h-5 text-teal-700" />
                        <h3 className="font-bold text-gray-900 text-lg">Estimated Breakdown</h3>
                    </div>

                    <div className="space-y-4 flex-1">
                        <div className="flex justify-between items-center text-gray-600">
                            <span>Base Physio Rate</span>
                            <span className="font-medium text-gray-900">{formatNaira(sessionRate)} <span className="text-xs text-gray-400 font-normal">/ session</span></span>
                        </div>

                        {sessionCount === 1 ? (
                            <>
                                <div className="flex justify-between items-center text-gray-600">
                                    <span>Platform Booking Fee</span>
                                    <span className="font-medium text-gray-900">{formatNaira(fees.platformFee)}</span>
                                </div>
                                <div className="flex justify-between items-center text-gray-500 text-sm">
                                    <span className="flex items-center gap-1">First-session Assessment <Info className="w-3 h-3" /></span>
                                    <span>{formatNaira(INITIAL_ASSESSMENT_FEE)}</span>
                                </div>
                                <div className="flex justify-between items-center text-gray-500 text-sm">
                                    <span className="flex items-center gap-1">Medical Record setup <Info className="w-3 h-3" /></span>
                                    <span>{formatNaira(AWADOC_FEE)}</span>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex justify-between items-center text-gray-600">
                                    <span>{sessionCount}x Sessions</span>
                                    <span className="font-medium text-gray-900">{formatNaira(sessionRate * sessionCount)}</span>
                                </div>
                                <div className="flex justify-between items-center text-green-600 font-medium">
                                    <span>Package Discount ({discountPercent}%)</span>
                                    <span>-{formatNaira(Math.round(sessionRate * sessionCount * (discountPercent / 100)))}</span>
                                </div>
                                <div className="flex justify-between items-center text-gray-500 text-sm mt-2">
                                    <span>Platform & Setup Fees included</span>
                                    <span></span>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="mt-8 pt-6 border-t border-gray-200">
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-lg font-bold text-gray-900">Total Estimate</span>
                            <motion.span
                                key={packageTotal}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="text-3xl font-black text-[#005B57]"
                            >
                                {formatNaira(packageTotal)}
                            </motion.span>
                        </div>
                        <p className="text-xs text-gray-500 text-right">
                            *Actual prices may vary slightly based on specific physio rates.
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
