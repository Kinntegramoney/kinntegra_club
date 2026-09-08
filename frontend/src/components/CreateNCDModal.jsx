import { useState } from "react";
import { X, TrendingUp, Check, Edit } from "lucide-react";
import CreateBondNew from "@/pages/CreateBondNew";

/**
 * Modal wrapper for the NCD create / edit flow, styled identically to
 * CreateRealEstateModal:
 *   • Full-screen dark overlay
 *   • White rounded card with FIXED header, FIXED section tabs and SCROLLABLE body
 *
 * Pass a `bond` prop to switch to edit mode — CreateBondNew pre-fills from it
 * and calls PUT /api/bonds/{id} instead of POST.
 */
export default function CreateNCDModal({ bond, onClose, onSuccess }) {
  const isEditing = Boolean(bond?.id);
  const [step, setStep] = useState(1);

  const sections = [
    { n: 1, label: "Basic Details" },
    { n: 2, label: "Cashflow Upload" },
    { n: 3, label: "Media" },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header — Fixed */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-etihad-gold-100 rounded-lg flex items-center justify-center">
              {isEditing
                ? <Edit className="h-5 w-5 text-etihad-gold-700" />
                : <TrendingUp className="h-5 w-5 text-etihad-gold-700" />}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">
                {isEditing ? `Edit NCD — ${bond?.bond_code || bond?.name || ""}` : "Add NCD"}
              </h2>
              <p className="text-sm text-gray-500">
                {isEditing
                  ? "Update bond details, cashflows and media"
                  : "Fill in the NCD details, upload cashflows and add media"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
            data-testid="close-ncd-modal-btn"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Section Tabs — Fixed */}
        <div className="flex-shrink-0 flex border-b border-gray-200 px-6 overflow-x-auto bg-white">
          {sections.map((s) => (
            <button
              key={s.n}
              type="button"
              onClick={() => setStep(s.n)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
                step === s.n
                  ? "border-etihad-gold-500 text-etihad-gold-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              data-testid={`ncd-step-tab-${s.n}`}
            >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                step > s.n
                  ? "bg-green-600 text-white"
                  : step === s.n
                    ? "bg-etihad-gold-500 text-white"
                    : "bg-slate-200 text-slate-600"
              }`}>
                {step > s.n ? <Check className="w-3.5 h-3.5" /> : s.n}
              </span>
              <span className="text-sm font-medium">{s.label}</span>
            </button>
          ))}
        </div>

        {/* Form Content — Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0">
          <CreateBondNew
            bond={bond}
            onClose={onClose}
            onSuccess={onSuccess}
            controlledStep={step}
            onStepChange={setStep}
          />
        </div>
      </div>
    </div>
  );
}
