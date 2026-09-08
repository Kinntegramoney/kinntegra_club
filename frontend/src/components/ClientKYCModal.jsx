import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  X, Upload, FileText, Trash2, Check, User, CreditCard, 
  Briefcase, Building, MapPin, Landmark, Users, Loader2, AlertCircle
} from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DOCUMENT_TYPES = [
  { id: "pan_card", label: "PAN Card" },
  { id: "passport", label: "Passport" },
  { id: "address_proof", label: "Address Proof" },
  { id: "bank_statement", label: "Bank Statement" },
  { id: "other", label: "Other KYC Document" }
];

const OPPORTUNITY_OPTIONS = [
  { id: "ncd", label: "Unlisted NCDs", description: "High-yield fixed income securities" },
  { id: "real_estate", label: "Dubai Real Estate", description: "Fractional property ownership" },
  { id: "portfolio_analysis", label: "Portfolio Analysis", description: "Mutual fund analytics & optimization" }
];

export default function ClientKYCModal({ isOpen, onClose, clientProfile, onSuccess }) {
  const [currentStep, setCurrentStep] = useState(3); // Start at step 3
  const [loading, setLoading] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [documents, setDocuments] = useState([]);
  
  const [formData, setFormData] = useState({
    // Step 3: Opportunities
    opportunities: [],
    
    // Step 4: Additional Details
    date_of_birth: "",
    occupation: "",
    father_husband_name: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    pincode: "",
    country: clientProfile?.country_of_residency || "",
    
    // Bank Details
    bank_name: "",
    bank_account_no: "",
    bank_ifsc: "",
    bank_branch: "",
    
    // International Bank
    intl_bank_name: "",
    intl_bank_account_no: "",
    intl_bank_swift: "",
    intl_bank_iban: "",
    
    // Demat Details
    demat_account_no: "",
    depository: "",
    dp_id: "",
    
    // Nominee Details
    nominee_name: "",
    nominee_relationship: "",
    nominee_dob: "",
    nominee_mobile: ""
  });

  // Pre-populate with existing client data
  useEffect(() => {
    if (clientProfile) {
      setFormData(prev => ({
        ...prev,
        date_of_birth: clientProfile.date_of_birth || "",
        occupation: clientProfile.occupation || "",
        father_husband_name: clientProfile.father_husband_name || "",
        address_line1: clientProfile.address_line1 || "",
        address_line2: clientProfile.address_line2 || "",
        city: clientProfile.city || "",
        state: clientProfile.state || "",
        pincode: clientProfile.pincode || "",
        country: clientProfile.country_of_residency || clientProfile.country || "",
        bank_name: clientProfile.bank_name || "",
        bank_account_no: clientProfile.bank_account_no || "",
        bank_ifsc: clientProfile.bank_ifsc || "",
        bank_branch: clientProfile.bank_branch || "",
        intl_bank_name: clientProfile.intl_bank_name || "",
        intl_bank_account_no: clientProfile.intl_bank_account_no || "",
        intl_bank_swift: clientProfile.intl_bank_swift || "",
        intl_bank_iban: clientProfile.intl_bank_iban || "",
        demat_account_no: clientProfile.demat_account_no || "",
        depository: clientProfile.depository || "",
        dp_id: clientProfile.dp_id || "",
        nominee_name: clientProfile.nominee_name || "",
        nominee_relationship: clientProfile.nominee_relationship || "",
        nominee_dob: clientProfile.nominee_dob || "",
        nominee_mobile: clientProfile.nominee_mobile || "",
        opportunities: clientProfile.opportunities || []
      }));
    }
  }, [clientProfile]);

  // Fetch existing documents
  useEffect(() => {
    if (isOpen) {
      fetchDocuments();
    }
  }, [isOpen]);

  const fetchDocuments = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/client/kyc-documents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDocuments(response.data.documents || []);
    } catch (error) {
      console.error("Error fetching documents:", error);
    }
  };

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleOpportunity = (oppId) => {
    setFormData(prev => ({
      ...prev,
      opportunities: prev.opportunities.includes(oppId)
        ? prev.opportunities.filter(id => id !== oppId)
        : [...prev.opportunities, oppId]
    }));
  };

  const handleDocumentUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error("Only PDF files are allowed");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size must be less than 5MB");
      return;
    }

    if (documents.length >= 5) {
      toast.error("Maximum 5 documents allowed");
      return;
    }

    setUploadingDoc(true);
    try {
      const token = localStorage.getItem("token");
      const formDataUpload = new FormData();
      formDataUpload.append("file", file);
      formDataUpload.append("document_type", "other"); // Default type

      await axios.post(`${API}/client/upload-kyc-document`, formDataUpload, {
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data"
        }
      });

      toast.success("Document uploaded successfully");
      fetchDocuments();
    } catch (error) {
      console.error("Error uploading document:", error);
      toast.error(error.response?.data?.detail || "Failed to upload document");
    } finally {
      setUploadingDoc(false);
      e.target.value = "";
    }
  };

  const handleDeleteDocument = async (docId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/client/kyc-document/${docId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Document deleted");
      fetchDocuments();
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Failed to delete document");
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API}/client/submit-kyc`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success("KYC submitted successfully! Your broker will verify your details.");
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("Error submitting KYC:", error);
      toast.error(error.response?.data?.detail || "Failed to submit KYC");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isNRI = clientProfile?.country_of_residency?.toLowerCase() !== 'india';

  const steps = [
    { num: 1, label: "Basic Info", icon: User, disabled: true },
    { num: 2, label: "ID Details", icon: CreditCard, disabled: true },
    { num: 3, label: "Opportunities", icon: Briefcase },
    { num: 4, label: "Additional", icon: FileText },
    { num: 5, label: "Documents", icon: Upload }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" data-testid="kyc-modal">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-teal-50">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Complete Your KYC</h2>
            <p className="text-sm text-gray-500">Fill in the remaining details to unlock all features</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-6 py-4 bg-gray-50 border-b">
          <div className="flex items-center justify-between">
            {steps.map((step, idx) => (
              <div key={step.num} className="flex items-center">
                <div 
                  className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-all ${
                    step.disabled 
                      ? "bg-green-500 text-white" 
                      : currentStep >= step.num 
                        ? "bg-emerald-600 text-white cursor-pointer hover:bg-emerald-700" 
                        : "bg-gray-200 text-gray-500 cursor-pointer hover:bg-gray-300"
                  }`}
                  onClick={() => !step.disabled && setCurrentStep(step.num)}
                >
                  {step.disabled ? <Check className="h-4 w-4" /> : step.num}
                </div>
                <span className={`ml-2 text-sm hidden sm:inline ${
                  step.disabled ? "text-green-600" : currentStep >= step.num ? "text-emerald-700 font-medium" : "text-gray-500"
                }`}>
                  {step.label}
                </span>
                {idx < steps.length - 1 && (
                  <div className={`w-8 sm:w-16 h-0.5 mx-2 ${
                    step.disabled || currentStep > step.num ? "bg-green-500" : "bg-gray-200"
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Info Banner */}
        <div className="px-6 py-3 bg-blue-50 border-b border-blue-100">
          <div className="flex items-center gap-2 text-blue-700 text-sm">
            <AlertCircle className="h-4 w-4" />
            <span>Steps 1 & 2 were completed during registration. Please complete the remaining steps.</span>
          </div>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 3: Opportunities */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <Briefcase className="h-5 w-5 text-emerald-600" />
                <h3 className="text-lg font-semibold text-gray-800">Investment Opportunities</h3>
              </div>

              <p className="text-gray-600">Select the investment opportunities you're interested in:</p>

              <div className="grid gap-4">
                {OPPORTUNITY_OPTIONS.map(opp => (
                  <div
                    key={opp.id}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      formData.opportunities.includes(opp.id)
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => toggleOpportunity(opp.id)}
                    data-testid={`opp-${opp.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={formData.opportunities.includes(opp.id)}
                        onCheckedChange={() => toggleOpportunity(opp.id)}
                      />
                      <div>
                        <p className="font-semibold">{opp.label}</p>
                        <p className="text-sm text-gray-500">{opp.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Additional Details */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="h-5 w-5 text-emerald-600" />
                <h3 className="text-lg font-semibold text-gray-800">Additional Details</h3>
              </div>

              {/* Personal Details */}
              <div className="space-y-4">
                <h4 className="font-medium text-gray-700 flex items-center gap-2">
                  <User className="h-4 w-4" /> Personal Details
                </h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Date of Birth</Label>
                    <Input
                      type="date"
                      value={formData.date_of_birth}
                      onChange={(e) => updateField('date_of_birth', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Occupation</Label>
                    <Input
                      value={formData.occupation}
                      onChange={(e) => updateField('occupation', e.target.value)}
                      placeholder="e.g., Business, Service"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Father/Husband Name</Label>
                    <Input
                      value={formData.father_husband_name}
                      onChange={(e) => updateField('father_husband_name', e.target.value)}
                      placeholder="Father's or Husband's name"
                    />
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="space-y-4 pt-4 border-t">
                <h4 className="font-medium text-gray-700 flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> Address Details
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Address Line 1</Label>
                    <Input
                      value={formData.address_line1}
                      onChange={(e) => updateField('address_line1', e.target.value)}
                      placeholder="Building, Street"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Address Line 2</Label>
                    <Input
                      value={formData.address_line2}
                      onChange={(e) => updateField('address_line2', e.target.value)}
                      placeholder="Area, Landmark"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">City</Label>
                    <Input
                      value={formData.city}
                      onChange={(e) => updateField('city', e.target.value)}
                      placeholder="City"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">State</Label>
                    <Input
                      value={formData.state}
                      onChange={(e) => updateField('state', e.target.value)}
                      placeholder="State"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Pincode</Label>
                    <Input
                      value={formData.pincode}
                      onChange={(e) => updateField('pincode', e.target.value)}
                      placeholder="Postal Code"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Country</Label>
                    <Input
                      value={formData.country}
                      onChange={(e) => updateField('country', e.target.value)}
                      placeholder="Country"
                    />
                  </div>
                </div>
              </div>

              {/* Bank Details */}
              <div className="space-y-4 pt-4 border-t">
                <h4 className="font-medium text-gray-700 flex items-center gap-2">
                  <Landmark className="h-4 w-4" /> Bank Details (Indian Account)
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Bank Name</Label>
                    <Input
                      value={formData.bank_name}
                      onChange={(e) => updateField('bank_name', e.target.value)}
                      placeholder="e.g., HDFC Bank"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Account Number</Label>
                    <Input
                      value={formData.bank_account_no}
                      onChange={(e) => updateField('bank_account_no', e.target.value)}
                      placeholder="Account Number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">IFSC Code</Label>
                    <Input
                      value={formData.bank_ifsc}
                      onChange={(e) => updateField('bank_ifsc', e.target.value.toUpperCase())}
                      placeholder="HDFC0001234"
                      className="uppercase"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Branch</Label>
                    <Input
                      value={formData.bank_branch}
                      onChange={(e) => updateField('bank_branch', e.target.value)}
                      placeholder="Branch Name"
                    />
                  </div>
                </div>
              </div>

              {/* International Bank - Show for NRIs */}
              {isNRI && (
                <div className="space-y-4 pt-4 border-t">
                  <h4 className="font-medium text-gray-700 flex items-center gap-2">
                    <Building className="h-4 w-4" /> International Bank Details
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500 uppercase">Bank Name</Label>
                      <Input
                        value={formData.intl_bank_name}
                        onChange={(e) => updateField('intl_bank_name', e.target.value)}
                        placeholder="International Bank Name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500 uppercase">Account Number</Label>
                      <Input
                        value={formData.intl_bank_account_no}
                        onChange={(e) => updateField('intl_bank_account_no', e.target.value)}
                        placeholder="Account Number"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500 uppercase">SWIFT Code</Label>
                      <Input
                        value={formData.intl_bank_swift}
                        onChange={(e) => updateField('intl_bank_swift', e.target.value.toUpperCase())}
                        placeholder="SWIFT/BIC Code"
                        className="uppercase"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500 uppercase">IBAN</Label>
                      <Input
                        value={formData.intl_bank_iban}
                        onChange={(e) => updateField('intl_bank_iban', e.target.value.toUpperCase())}
                        placeholder="International Bank Account Number"
                        className="uppercase"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Nominee Details */}
              <div className="space-y-4 pt-4 border-t">
                <h4 className="font-medium text-gray-700 flex items-center gap-2">
                  <Users className="h-4 w-4" /> Nominee Details
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Nominee Name</Label>
                    <Input
                      value={formData.nominee_name}
                      onChange={(e) => updateField('nominee_name', e.target.value)}
                      placeholder="Full Name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Relationship</Label>
                    <Input
                      value={formData.nominee_relationship}
                      onChange={(e) => updateField('nominee_relationship', e.target.value)}
                      placeholder="e.g., Spouse, Child"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Date of Birth</Label>
                    <Input
                      type="date"
                      value={formData.nominee_dob}
                      onChange={(e) => updateField('nominee_dob', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Mobile Number</Label>
                    <Input
                      value={formData.nominee_mobile}
                      onChange={(e) => updateField('nominee_mobile', e.target.value)}
                      placeholder="+91 XXXXX XXXXX"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Document Upload */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <Upload className="h-5 w-5 text-emerald-600" />
                <h3 className="text-lg font-semibold text-gray-800">Upload KYC Documents</h3>
              </div>

              <p className="text-gray-600">
                Upload supporting documents for KYC verification. Maximum 5 documents in PDF format (max 5MB each).
              </p>

              {/* Document Upload Area */}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-emerald-400 transition-colors">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleDocumentUpload}
                  className="hidden"
                  id="kyc-doc-upload"
                  disabled={uploadingDoc || documents.length >= 5}
                />
                <label 
                  htmlFor="kyc-doc-upload" 
                  className={`cursor-pointer ${documents.length >= 5 ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {uploadingDoc ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
                      <span className="text-gray-600">Uploading...</span>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-600 font-medium">
                        {documents.length >= 5 
                          ? "Maximum documents reached" 
                          : "Click to upload PDF document"}
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        {documents.length}/5 documents uploaded
                      </p>
                    </>
                  )}
                </label>
              </div>

              {/* Document Types Guide */}
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Recommended documents to upload:</p>
                <ul className="text-sm text-gray-600 space-y-1">
                  {DOCUMENT_TYPES.map(doc => (
                    <li key={doc.id} className="flex items-center gap-2">
                      <FileText className="h-3 w-3 text-gray-400" />
                      {doc.label}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Uploaded Documents List */}
              {documents.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-medium text-gray-700">Uploaded Documents</h4>
                  {documents.map(doc => (
                    <div 
                      key={doc.id}
                      className="flex items-center justify-between p-3 bg-white border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                          <FileText className="h-5 w-5 text-red-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-800">{doc.filename}</p>
                          <p className="text-xs text-gray-500">
                            {(doc.size / 1024).toFixed(1)} KB • Uploaded {new Date(doc.uploaded_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDeleteDocument(doc.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer with Navigation */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(Math.max(3, currentStep - 1))}
            disabled={currentStep <= 3}
          >
            Previous
          </Button>

          <div className="flex items-center gap-2">
            {currentStep < 5 ? (
              <Button
                onClick={() => setCurrentStep(currentStep + 1)}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                Next
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-700"
                data-testid="submit-kyc-btn"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Submit KYC
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
