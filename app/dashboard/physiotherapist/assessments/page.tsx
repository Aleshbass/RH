"use client";

export default function PhysiotherapistAssessmentsPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Patient Assessments</h1>
        <p className="text-gray-600 mt-2">
          Manage and review patient assessments and evaluations.
        </p>
      </div>
      
      <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
        <div className="max-w-md mx-auto">
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Assessment System Coming Soon
          </h3>
          <p className="text-gray-600 mb-4">
            This feature is currently under development. You&apos;ll be able to create, manage, and review patient assessments here.
          </p>
          <div className="text-sm text-gray-500">
            Features in development:
            <ul className="mt-2 space-y-1">
              <li>• Initial patient evaluations</li>
              <li>• Progress assessments</li>
              <li>• Treatment outcome tracking</li>
              <li>• Assessment templates</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
