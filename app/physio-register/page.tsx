import { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, Search, UserPlus, ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
    title: 'Physio Register | Verify Licensed Physiotherapists',
    description: 'The Physio Register is a public database of verified physiotherapists. Register your credentials or verify a physiotherapist\'s license.',
};

export default function PhysioRegisterPage() {
    return (
        <main className="min-h-screen bg-gradient-to-b from-white via-teal-50/30 to-white pt-24 pb-16">
            <div className="max-w-4xl mx-auto px-4">
                {/* Hero */}
                <div className="text-center mb-12">
                    <div className="w-16 h-16 rounded-2xl bg-[#005b57] flex items-center justify-center mx-auto mb-6 shadow-lg shadow-teal-900/20">
                        <ShieldCheck className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-4xl md:text-5xl font-bold text-[#002e2c] mb-4">
                        Physio Register
                    </h1>
                    <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                        A public registry of verified physiotherapists. Register your credentials to be publicly
                        verifiable, or search for a physiotherapist to confirm their license status.
                    </p>
                </div>

                {/* Two Cards */}
                <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
                    {/* Register Card */}
                    <Link
                        href="/physio-register/register"
                        className="group bg-white rounded-2xl border border-gray-100 p-8 shadow-sm hover:shadow-xl hover:border-teal-200 transition-all duration-300"
                    >
                        <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center mb-5 group-hover:bg-[#005b57] transition-colors">
                            <UserPlus className="w-6 h-6 text-[#005b57] group-hover:text-white transition-colors" />
                        </div>
                        <h2 className="text-xl font-bold text-[#002e2c] mb-2">
                            Register as a Physiotherapist
                        </h2>
                        <p className="text-gray-500 text-sm mb-4">
                            Add your credentials and license details to the public registry. Get verified so patients,
                            employers, and insurers can confirm your qualifications.
                        </p>
                        <span className="inline-flex items-center text-sm font-semibold text-[#005b57] group-hover:gap-2 transition-all">
                            Start Registration <ArrowRight className="w-4 h-4 ml-1" />
                        </span>
                    </Link>

                    {/* Verify Card */}
                    <Link
                        href="/physio-register/verify"
                        className="group bg-white rounded-2xl border border-gray-100 p-8 shadow-sm hover:shadow-xl hover:border-teal-200 transition-all duration-300"
                    >
                        <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center mb-5 group-hover:bg-[#005b57] transition-colors">
                            <Search className="w-6 h-6 text-[#005b57] group-hover:text-white transition-colors" />
                        </div>
                        <h2 className="text-xl font-bold text-[#002e2c] mb-2">
                            Verify a Physiotherapist
                        </h2>
                        <p className="text-gray-500 text-sm mb-4">
                            Search by name or MRTB license number to check if a physiotherapist is genuinely
                            licensed and verified on the registry.
                        </p>
                        <span className="inline-flex items-center text-sm font-semibold text-[#005b57] group-hover:gap-2 transition-all">
                            Search Registry <ArrowRight className="w-4 h-4 ml-1" />
                        </span>
                    </Link>
                </div>

                {/* Info section */}
                <div className="mt-16 max-w-2xl mx-auto text-center">
                    <h3 className="text-lg font-semibold text-[#002e2c] mb-3">How it works</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-sm text-gray-600">
                        <div className="bg-white rounded-xl p-4 border border-gray-100">
                            <div className="w-8 h-8 rounded-lg bg-teal-100 text-[#005b57] font-bold flex items-center justify-center mx-auto mb-2">1</div>
                            <p>Submit your license &amp; credentials</p>
                        </div>
                        <div className="bg-white rounded-xl p-4 border border-gray-100">
                            <div className="w-8 h-8 rounded-lg bg-teal-100 text-[#005b57] font-bold flex items-center justify-center mx-auto mb-2">2</div>
                            <p>Our team verifies your documents</p>
                        </div>
                        <div className="bg-white rounded-xl p-4 border border-gray-100">
                            <div className="w-8 h-8 rounded-lg bg-teal-100 text-[#005b57] font-bold flex items-center justify-center mx-auto mb-2">3</div>
                            <p>Your profile is publicly verifiable</p>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
