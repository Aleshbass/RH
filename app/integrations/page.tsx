
import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
    Building2,
    Stethoscope,
    Laptop,
    Database,
    Code,
    CheckCircle,
    ArrowRight,
    Shield,
    Lock,
    FileText,
    Activity
} from 'lucide-react';

export default function IntegrationsPage() {
    return (
        <div className="bg-[#FAF6E7] min-h-screen font-sans text-gray-900">
            {/* 1. Hero Section */}
            <section className="relative pt-32 pb-20 px-6 lg:px-8 max-w-7xl mx-auto text-center">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 opacity-30 pointer-events-none">
                    <div className="absolute top-20 left-10 w-72 h-72 bg-[#002e2c]/10 rounded-full blur-3xl"></div>
                    <div className="absolute bottom-20 right-10 w-96 h-96 bg-[#002e2c]/5 rounded-full blur-3xl"></div>
                </div>

                <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-[#002e2c] mb-6 font-cal">
                    Integrate RehabifyHealth Into <br className="hidden md:block" /> Your Hospital or Clinic System
                </h1>
                <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-10 leading-relaxed">
                    Connect your EMR/EHR, appointment software, billing platform, or internal tools with our Tele-Physio API.
                    Fast, secure, compliant.
                </p>

                <div className="flex flex-col sm:flex-row justify-center gap-4">
                    <Link href="#survey" className="bg-[#002e2c] text-white font-semibold py-4 px-8 rounded-lg hover:bg-[#005b57] transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2">
                        Take Integration Survey <ArrowRight className="w-4 h-4" />
                    </Link>
                    <Link href="/contact" className="bg-white text-[#002e2c] border border-[#002e2c] font-semibold py-4 px-8 rounded-lg hover:bg-gray-50 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2">
                        Talk to Sales
                    </Link>
                </div>
                <div className="mt-6">
                    <Link href="/docs/api" className="text-gray-500 hover:text-[#002e2c] font-medium text-sm border-b border-transparent hover:border-[#002e2c] transition-colors duration-200">
                        View API Documentation →
                    </Link>
                </div>
            </section>

            {/* 2. Who This Integration Is For */}
            <section className="py-16 bg-white border-y border-gray-100">
                <div className="max-w-7xl mx-auto px-6 lg:px-8">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold text-gray-900 font-cal">Built for Healthcare Ecosystems</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
                        {[
                            { icon: Building2, label: "Hospitals & Clinics" },
                            { icon: Stethoscope, label: "Healthcare Networks" },
                            { icon: Laptop, label: "Telehealth Platforms" },
                            { icon: Database, label: "EMR/EHR Developers" },
                            { icon: Code, label: "Custom Software Teams" },
                        ].map((item, index) => (
                            <div key={index} className="bg-[#FAF6E7] p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col items-center text-center group">
                                <div className="w-12 h-12 bg-[#002e2c]/5 text-[#002e2c] rounded-full flex items-center justify-center mb-4 group-hover:bg-[#002e2c] group-hover:text-white transition-colors duration-200">
                                    <item.icon className="w-5 h-5" />
                                </div>
                                <span className="font-semibold text-gray-800">{item.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* 3. What You Can Integrate */}
            <section className="py-20 px-6 lg:px-8 max-w-7xl mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                    <div>
                        <h2 className="text-4xl font-bold text-[#002e2c] mb-6 font-cal">Seamless Data Flow</h2>
                        <p className="text-lg text-gray-600 mb-8">
                            Our API allows for bi-directional synchronization of critical patient and treatment data, ensuring your team never has to duplicate entry.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {[
                                "Patient Management",
                                "Physiotherapist Assignment",
                                "Tele-Consultation Scheduling",
                                "Exercise Program Delivery",
                                "Billing & Payouts",
                                "Clinical Reports & Outcomes",
                                "Automated Reminders",
                                "Access to Medical Notes & Analytics",
                            ].map((feature, index) => (
                                <div key={index} className="flex items-center gap-3">
                                    <CheckCircle className="text-[#002e2c] w-5 h-5 flex-shrink-0" />
                                    <span className="text-gray-700">{feature}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl p-8 border border-gray-100 relative overflow-hidden shadow-sm">
                        {/* Abstract UI representation */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-[#002e2c]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                        <div className="space-y-4 relative z-10">
                            <div className="bg-[#FAF6E7] p-4 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                                    <div>
                                        <div className="h-4 w-32 bg-gray-200 rounded mb-2"></div>
                                        <div className="h-3 w-20 bg-gray-100 rounded"></div>
                                    </div>
                                </div>
                                <div className="h-6 w-16 bg-green-100 rounded-full"></div>
                            </div>
                            <div className="bg-[#FAF6E7] p-4 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between opacity-80">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                                    <div>
                                        <div className="h-4 w-28 bg-gray-200 rounded mb-2"></div>
                                        <div className="h-3 w-24 bg-gray-100 rounded"></div>
                                    </div>
                                </div>
                                <div className="h-6 w-16 bg-blue-100 rounded-full"></div>
                            </div>
                            <div className="bg-[#FAF6E7] p-4 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between opacity-60">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                                    <div>
                                        <div className="h-4 w-36 bg-gray-200 rounded mb-2"></div>
                                        <div className="h-3 w-16 bg-gray-100 rounded"></div>
                                    </div>
                                </div>
                                <div className="h-6 w-16 bg-gray-200 rounded-full"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 5. How RehabifyHealth Integrates (Diagram) */}
            <section className="py-20 bg-[#002e2c] text-white">
                <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
                    <h2 className="text-3xl font-bold mb-12 font-cal text-white">Unified Workflow Architecture</h2>

                    <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16 relative">
                        {/* Your System */}
                        <div className="bg-white/5 p-8 rounded-2xl border border-white/10 w-full md:w-80 text-center z-10 backdrop-blur-sm">
                            <div className="w-16 h-16 bg-white/10 text-white rounded-xl flex items-center justify-center mx-auto mb-6">
                                <Database className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-bold mb-2 text-white">Your System</h3>
                            <p className="text-gray-300 text-sm">EMR, EHR, or Internal Tools</p>
                        </div>

                        {/* Connection Lines (Desktop) */}
                        <div className="hidden md:flex items-center justify-center flex-1 relative h-2">
                            <div className="absolute w-full h-0.5 bg-white/20"></div>
                            <div className="w-3 h-3 bg-[#005b57] rounded-full relative z-10 animate-pulse"></div>
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#002e2c] px-4 text-xs text-gray-300 font-mono">JSON / REST</div>
                        </div>

                        {/* Connection Lines (Mobile) */}
                        <div className="md:hidden h-16 w-0.5 bg-white/20 relative">
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#002e2c] py-2 text-xs text-gray-300 font-mono rotate-90">JSON</div>
                        </div>

                        {/* Rehabify API */}
                        <div className="bg-white/10 p-8 rounded-2xl border border-[#005b57]/50 w-full md:w-80 text-center z-10 shadow-[0_0_40px_-10px_rgba(0,255,255,0.1)] backdrop-blur-sm">
                            <div className="w-16 h-16 bg-white/10 rounded-xl flex items-center justify-center mx-auto mb-6">
                                <Activity className="w-8 h-8 text-white" />
                            </div>
                            <h3 className="text-xl font-bold mb-2 text-white">Rehabify API</h3>
                            <p className="text-gray-300 text-sm">Secure Data Processing</p>
                        </div>

                        {/* Connection Lines (Desktop) */}
                        <div className="hidden md:flex items-center justify-center flex-1 relative h-2">
                            <div className="absolute w-full h-0.5 bg-white/20"></div>
                            <div className="w-3 h-3 bg-[#005b57] rounded-full relative z-10 animate-pulse delay-75"></div>
                        </div>

                        {/* Connection Lines (Mobile) */}
                        <div className="md:hidden h-16 w-0.5 bg-white/20"></div>

                        {/* Tele-physio Workflows */}
                        <div className="bg-white/5 p-8 rounded-2xl border border-white/10 w-full md:w-80 text-center z-10 backdrop-blur-sm">
                            <div className="w-16 h-16 bg-white/10 text-white rounded-xl flex items-center justify-center mx-auto mb-6">
                                <Laptop className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-bold mb-2 text-white">Tele-Physio</h3>
                            <p className="text-gray-300 text-sm">Workflows & Delivery</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* 4. Two Clear Paths Section (The MOST important part) */}
            <section id="survey" className="py-24 px-6 lg:px-8 max-w-7xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Panel 1 */}
                    <div className="bg-[#002e2c] rounded-3xl p-10 border border-[#002e2c] flex flex-col items-start text-white relative overflow-hidden shadow-lg">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
                        <div className="bg-white/10 p-3 rounded-lg backdrop-blur-sm mb-6 relative z-10">
                            <CheckCircle className="w-6 h-6 text-white" />
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-3 font-cal relative z-10">Not sure what you need? Start here.</h3>
                        <p className="text-gray-200 mb-8 flex-grow relative z-10">
                            Answer a 3–6 question survey to help us understand your clinic’s workflow, existing software, and integration method.
                        </p>
                        <Link href="https://tally.so/r/w7XN0y" target="_blank" className="w-full bg-white text-[#002e2c] font-semibold py-4 rounded-xl hover:bg-gray-100 transition-all duration-200 text-center shadow-lg relative z-10 flex items-center justify-center gap-2">
                            Start Survey <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>

                    {/* Panel 2 */}
                    <div className="bg-[#002e2c] rounded-3xl p-10 border border-[#002e2c] flex flex-col items-start text-white relative overflow-hidden shadow-lg">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

                        <div className="bg-white/10 p-3 rounded-lg backdrop-blur-sm mb-6">
                            <Stethoscope className="w-6 h-6 text-white" />
                        </div>
                        <h3 className="text-2xl font-bold mb-3 font-cal text-white">Want direct support?</h3>
                        <p className="text-gray-200 mb-8 flex-grow">
                            Speak with our technical team to discuss your integration needs, data models, API access, and implementation timelines.
                        </p>
                        <Link href="/contact" className="w-full bg-white text-[#002e2c] border border-transparent font-semibold py-4 rounded-xl hover:bg-gray-100 transition-all duration-200 text-center shadow-lg flex items-center justify-center gap-2">
                            Book a Call <ArrowRight className="w-4 h-4" />
                        </Link>
                        <p className="text-xs text-gray-300 mt-4 text-center w-full">Response in under 24 hours.</p>
                    </div>
                </div>
            </section>

            {/* 6. Integration Options Section */}
            <section className="py-20 bg-white border-t border-gray-200">
                <div className="max-w-7xl mx-auto px-6 lg:px-8">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold text-gray-900 font-cal">Flexible Integration Options</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {/* Option A */}
                        <div className="bg-[#FAF6E7] p-8 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200">
                            <div className="text-sm font-bold text-[#002e2c] tracking-wider uppercase mb-4">Option A</div>
                            <h3 className="text-2xl font-bold text-gray-900 mb-4">REST API</h3>
                            <p className="text-gray-600 mb-8 min-h-[3rem]">For custom hospital EMR/EHR systems requiring deep data synchronization.</p>
                            <Link href="/docs/api" className="text-[#002e2c] font-semibold hover:text-[#005b57] flex items-center gap-2">
                                View API Docs <ArrowRight className="w-3 h-3" />
                            </Link>
                        </div>

                        {/* Option B */}
                        <div className="bg-[#FAF6E7] p-8 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200">
                            <div className="text-sm font-bold text-purple-600 tracking-wider uppercase mb-4">Option B</div>
                            <h3 className="text-2xl font-bold text-gray-900 mb-4">JS SDK / React</h3>
                            <p className="text-gray-600 mb-8 min-h-[3rem]">Pre-built components for frontend teams that want plug-and-play UI.</p>
                            <Link href="/docs/sdk" className="text-purple-600 font-semibold hover:text-purple-800 flex items-center gap-2">
                                View SDK Guide <ArrowRight className="w-3 h-3" />
                            </Link>
                        </div>

                        {/* Option C */}
                        <div className="bg-[#FAF6E7] p-8 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200">
                            <div className="text-sm font-bold text-blue-600 tracking-wider uppercase mb-4">Option C</div>
                            <h3 className="text-2xl font-bold text-gray-900 mb-4">Webhooks</h3>
                            <p className="text-gray-600 mb-8 min-h-[3rem]">Real-time event notifications to auto-sync your patient events.</p>
                            <Link href="/docs/webhooks" className="text-blue-600 font-semibold hover:text-blue-800 flex items-center gap-2">
                                Webhooks Guide <ArrowRight className="w-3 h-3" />
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* 7. Security & Compliance Section */}
            <section className="py-20 px-6 lg:px-8 max-w-7xl mx-auto">
                <div className="bg-[#002e2c] rounded-3xl border border-[#002e2c] p-8 md:p-16 text-center shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 text-white rounded-full mb-8 relative z-10">
                        <Shield className="w-8 h-8" />
                    </div>
                    <h2 className="text-3xl font-bold text-white mb-6 font-cal relative z-10">Enterprise-Grade Security</h2>
                    <p className="text-gray-200 max-w-2xl mx-auto mb-12 relative z-10">
                        We prioritize patient data protection with industry-standard security measures, ensuring your integration is safe and compliant.
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 relative z-10">
                        <div className="flex flex-col items-center gap-3">
                            <Lock className="w-6 h-6 text-gray-300" />
                            <span className="font-semibold text-white">Fully Encrypted</span>
                        </div>
                        <div className="flex flex-col items-center gap-3">
                            <FileText className="w-6 h-6 text-gray-300" />
                            <span className="font-semibold text-white">HIPAA Compliant</span>
                        </div>
                        <div className="flex flex-col items-center gap-3">
                            <Stethoscope className="w-6 h-6 text-gray-300" />
                            <span className="font-semibold text-white">Role-Based Access</span>
                        </div>
                        <div className="flex flex-col items-center gap-3">
                            <Database className="w-6 h-6 text-gray-300" />
                            <span className="font-semibold text-white">Audit Logging</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* 8. Final CTA Section */}
            <section className="py-24 bg-[#FAF6E7] text-[#002e2c] text-center px-6 border-t border-[#002e2c]/5">
                <h2 className="text-4xl md:text-5xl font-bold mb-8 font-cal text-[#002e2c]">Ready to integrate RehabifyHealth?</h2>
                <div className="flex flex-col sm:flex-row justify-center gap-4">
                    <Link href="#survey" className="bg-[#002e2c] text-white font-bold py-4 px-10 rounded-lg hover:bg-[#005b57] transition-colors duration-200 shadow-lg">
                        Take Survey
                    </Link>
                    <Link href="/contact" className="bg-transparent border border-[#002e2c] text-[#002e2c] font-bold py-4 px-10 rounded-lg hover:bg-[#002e2c] hover:text-white transition-colors duration-200">
                        Talk to Sales
                    </Link>
                </div>
            </section>
        </div>
    );
}
