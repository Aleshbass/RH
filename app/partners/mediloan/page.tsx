import React from "react";
import Link from "next/link";
import { ArrowLeft } from "@/components/icons";

export const metadata = {
  title: "MediLoan Disclaimer | Rehabify",
  description: "Important disclaimer regarding MediLoan healthcare financing by MyItura.",
};

export default function MediLoanDisclaimerPage() {
  return (
    <div className="min-h-screen bg-[#F5F0EA] flex flex-col">
      <main className="flex-grow container mx-auto px-4 py-16 md:py-24 max-w-4xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-medium mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>

        <div className="bg-white rounded-3xl p-8 md:p-12 shadow-sm border border-gray-100">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
            MediLoan Partner Disclaimer
          </h1>

          <div className="prose prose-emerald max-w-none text-gray-600 space-y-6">
            <p className="text-lg font-medium text-gray-800">
              Please read this important notice regarding the MediLoan healthcare financing service featured on our platform.
            </p>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-amber-900 my-8">
              <h2 className="text-xl font-semibold mb-3 text-amber-900 mt-0">
                Important Disclaimer
              </h2>
              <p className="mb-0">
                MediLoan is a healthcare financing service provided by <strong>MyItura</strong> — an independent third-party company. Rehabify Health and MediLoan are two separate entities.
              </p>
            </div>

            <h3 className="text-xl font-semibold text-gray-900 mt-8 mb-4">
              Our Role
            </h3>
            <p>
              Rehabify Health solely acts as a platform to facilitate the connection between patients requiring physiotherapy or neurorehabilitation services and MediLoan's financing options. We integrate their widget to make it easier for our patients to seek financial assistance for their treatments.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mt-8 mb-4">
              Limitations of Liability
            </h3>
            <ul className="list-disc pl-6 space-y-3">
              <li>
                <strong>No Guarantee of Approval:</strong> Rehabify Health does not manage, guarantee, or influence the approval of any loan applications. The decision to grant a loan rests entirely with MyItura.
              </li>
              <li>
                <strong>Repayment Terms:</strong> We do not set, manage, or enforce the repayment terms, interest rates, or any associated fees. Patients enter into a direct financial agreement with MyItura.
              </li>
              <li>
                <strong>Disputes and Issues:</strong> Rehabify Health takes no responsibility for any disputes, technical issues with the application process, defaults, or collection practices. All loan-related matters must be addressed directly with MediLoan/MyItura customer support.
              </li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mt-8 mb-4">
              More Information
            </h3>
            <p>
              By proceeding to apply for a MediLoan, you acknowledge that you understand and agree to this distinction between our services.
            </p>
            <p>
              For more information about MyItura, their terms of service, and privacy policy, please visit their official website.
            </p>

            <div className="mt-10 pt-8 border-t border-gray-100">
              <a
                href="https://myitura.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-8 rounded-xl transition-colors"
              >
                Visit MyItura Website
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
