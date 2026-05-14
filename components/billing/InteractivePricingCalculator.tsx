"use client";

import React, { useState } from "react";
import { calculateSessionPrice, calculatePackagePrice } from "@/lib/pricing";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calculator, Sparkles, Receipt, Info, Lock } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";

// Qualitative tier labels — no ₦ amounts shown publicly
function getRateTier(sessionRate: number): { label: string; color: string; description: string } {
    if (sessionRate >= 30_000) return { label: "Premium Rate", color: "text-purple-700", description: "Senior specialist / high-demand area" };
    if (sessionRate >= 22_000) return { label: "Above Average", color: "text-blue-700", description: "Experienced physio / major city" };
    if (sessionRate >= 18_000) return { label: "Moderate Rate", color: "text-teal-700", description: "Standard specialist in urban area" };
    return { label: "Standard Rate", color: "text-green-700", description: "Entry-level / secondary city" };
}

function getPackageTier(sessions: number, discount: number): { label: string; savings: string } {
    if (sessions === 1) return { label: "Pay-as-you-go", savings: "No discount" };
    if (sessions === 4) return { label: "Starter Saving", savings: `${discount}% off` };
    if (sessions === 8) return { label: "Good Value", savings: `${discount}% off` };
    return { label: "Best Value", savings: `${discount}% off` };
}

export function InteractivePricingCalculator() {
    const [locationTier, setLocationTier] = useState<number>(2);
    const [conditionLevel, setConditionLevel] = useState<string>("standard");
    const [expertiseLevel, setExpertiseLevel] = useState<string>("standard");
    const [sessionCount, setSessionCount] = useState<number>(1);

    const sessionRate = calculateSessionPrice(
        locationTier as Readonly<1 | 2 | 3 | 4>,
        conditionLevel as "standard" | "moderate" | "complex",
        expertiseLevel as "standard" | "senior" | "consultant"
    ).sessionRate;

    const discountPercent = sessionCount >= 12 ? 15 : sessionCount >= 8 ? 10 : sessionCount >= 4 ? 5 : 0;

    const rateTier = getRateTier(sessionRate);
    const packageTier = getPackageTier(sessionCount, discountPercent);

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
                    Adjust the parameters below to see a rate estimate for your session.
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
                                <SelectItem value="standard">Standard Physio (1–4 years)</SelectItem>
                                <SelectItem value="senior">Senior Physio (5–10 years)</SelectItem>
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

                {/* Results Column — qualitative only, no ₦ amounts */}
                <div className="bg-gray-50/80 rounded-2xl p-6 border border-gray-200 shadow-sm flex flex-col h-full">
                    <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-200">
                        <Receipt className="w-5 h-5 text-teal-700" />
                        <h3 className="font-bold text-gray-900 text-lg">Estimated Rate Tier</h3>
                    </div>

                    <div className="space-y-5 flex-1">
                        {/* Rate tier indicator */}
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Session Rate</p>
                            <motion.div
                                key={rateTier.label}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100"
                            >
                                <div className={`text-xl font-black ${rateTier.color}`}>{rateTier.label}</div>
                            </motion.div>
                            <p className="text-xs text-gray-400 mt-1.5 pl-1">{rateTier.description}</p>
                        </div>

                        {/* Package indicator */}
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Package Value</p>
                            <motion.div
                                key={packageTier.label}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100"
                            >
                                <span className="font-bold text-gray-800">{packageTier.label}</span>
                                <span className={`text-sm font-semibold ${discountPercent > 0 ? "text-green-700 bg-green-50 px-2 py-0.5 rounded-full" : "text-gray-400"}`}>
                                    {packageTier.savings}
                                </span>
                            </motion.div>
                        </div>

                        {/* What's included */}
                        <div className="pt-2">
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Includes</p>
                            <ul className="space-y-1.5 text-sm text-gray-600">
                                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-teal-500 inline-block" />One-on-one physiotherapy session</li>
                                {sessionCount === 1 && <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-teal-500 inline-block" />Initial health assessment</li>}
                                {sessionCount === 1 && <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-teal-500 inline-block" />Digital health record setup</li>}
                                {sessionCount > 1 && <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-teal-500 inline-block" />{sessionCount} sessions at discounted rate</li>}
                                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-teal-500 inline-block" />Secure payment via Paystack</li>
                            </ul>
                        </div>
                    </div>

                    {/* Lock / CTA */}
                    <div className="mt-6 pt-5 border-t border-gray-200">
                        <div className="flex items-center gap-2 mb-3 text-gray-500">
                            <Lock className="w-4 h-4" />
                            <span className="text-xs">Exact pricing shown after matching</span>
                        </div>
                        <Link
                            href="/start-treatment"
                            className="block w-full text-center bg-[#005B57] hover:bg-[#00443e] text-white font-semibold py-3 rounded-xl transition-colors text-sm shadow-md shadow-teal-900/10"
                        >
                            Get My Exact Price →
                        </Link>
                        <p className="text-xs text-gray-400 text-center mt-2">
                            Free to match · No commitment required
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

