import { useState } from "react";
import axios from "axios";
import { X, User, MapPin, Building2, Users, FileText, Upload, Copy, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

const RELATIONSHIPS = ["Spouse", "Father", "Mother", "Son", "Daughter", "Brother", "Sister", "Other"];

export default function CreateClientModal({ onClose, onSuccess, subbrokers = [] }) {
  const [loading, setLoading] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [credentials, setCredentials] = useState({ pan: "", password: "", pin: "", name: "", email: "" });
  const [copiedField, setCopiedField] = useState(null);
  const [formData, setFormData] = useState({
    // Personal Details
    name: "",
    pan_number: "",
    ucc: "",  // Unique Client Code
    occupation: "",
    date_of_birth: "",
    father_husband_name: "",
    demat_account_no: "",
    email: "",
    mobile: "",
    
    // Address Details
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    country: "India",
    pincode: "",
    
    // Bank Details
    bank_name: "",
    account_number: "",
    branch: "",
    ifsc_code: "",
    
    // Nominee Details
    nominee_name: "",
    nominee_dob: "",
    nominee_mobile: "",
    nominee_relationship: "",
    
    // Document uploads (file names stored)
    pan_document: "",
    aadhar_document: "",
    bank_cheque_document: "",
    cnl_document: "",
    
    // Linked Sub-broker
    linked_subbroker_id: ""
  });

  // Document file states
  const [documents, setDocuments] = useState({
    pan: null,
    aadhar: null,
    bank_cheque: null,
    cnl: null
  });

  const handleFileChange = (docType, file) => {
    if (file) {
      setDocuments(prev => ({ ...prev, [docType]: file }));
      setFormData(prev => ({ ...prev, [`${docType}_document`]: file.name }));
    }
  };

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast.success("Copied to clipboard!");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.pan_number || !formData.email || !formData.mobile) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const submitData = {
        ...formData,
        linked_subbroker_id: formData.linked_subbroker_id || null
      };
      
      const response = await axios.post(`${API}/clients`, submitData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Show credentials modal with returned credentials
      const clientData = response.data;
      setCredentials({
        name: formData.name,
        pan: formData.pan_number.toUpperCase(),
        email: formData.email,
        password: clientData.default_password || `${formData.pan_number.toUpperCase().slice(-4)}1234`,
        pin: clientData.default_pin || "1234"
      });
      setShowCredentials(true);
      
    } catch (error) {
      console.error("Error creating client:", error);
      toast.error(error.response?.data?.detail || "Failed to create client");
    } finally {
      setLoading(false);
    }
  };

  const handleCredentialsClose = () => {
    setShowCredentials(false);
    onSuccess();
  };

  // Credentials Modal
  if (showCredentials) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg w-full max-w-md overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-4 text-white">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Check className="h-6 w-6" />
              Client Created Successfully!
            </h2>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-semibold">Important: Save these credentials!</p>
                <p>Please share these login details with the client. They will need these to access their profile.</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-gray-700 mb-3">Login Credentials for {credentials.name}</h3>
              
              {/* PAN */}
              <div className="flex items-center justify-between bg-white rounded-md p-3 border">
                <div>
                  <p className="text-xs text-gray-500 uppercase">PAN (Username)</p>
                  <p className="font-mono font-semibold text-lg">{credentials.pan}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(credentials.pan, 'pan')}
                >
                  {copiedField === 'pan' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>

              {/* Password */}
              <div className="flex items-center justify-between bg-white rounded-md p-3 border">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Password</p>
                  <p className="font-mono font-semibold text-lg">{credentials.password}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(credentials.password, 'password')}
                >
                  {copiedField === 'password' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>

              {/* PIN */}
              <div className="flex items-center justify-between bg-white rounded-md p-3 border">
                <div>
                  <p className="text-xs text-gray-500 uppercase">PIN (2-Step Verification)</p>
                  <p className="font-mono font-semibold text-lg">{credentials.pin}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(credentials.pin, 'pin')}
                >
                  {copiedField === 'pin' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>

              {/* Copy All */}
              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={() => copyToClipboard(
                  `Login Credentials for ${credentials.name}\n\nPAN (Username): ${credentials.pan}\nPassword: ${credentials.password}\nPIN: ${credentials.pin}\n\nLogin URL: https://kinntegraa.club/login`,
                  'all'
                )}
              >
                {copiedField === 'all' ? <Check className="h-4 w-4 mr-2 text-green-500" /> : <Copy className="h-4 w-4 mr-2" />}
                Copy All Credentials
              </Button>
            </div>

            <Button 
              className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
              onClick={handleCredentialsClose}
            >
              I've Saved the Credentials - Close
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-amber-50">
          <h2 className="text-xl font-bold text-gray-800">Create New Client</h2>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-gray-600"
            data-testid="close-create-client-modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Personal Details */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <User className="h-5 w-5 text-amber-600" />
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Personal Details</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="Full Name"
                  data-testid="client-name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">PAN Card No *</Label>
                <Input
                  value={formData.pan_number}
                  onChange={(e) => updateField('pan_number', e.target.value.toUpperCase())}
                  placeholder="ABCDE1234F"
                  maxLength={10}
                  className="font-mono uppercase"
                  data-testid="client-pan"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">UCC (Unique Client Code)</Label>
                <Input
                  value={formData.ucc}
                  onChange={(e) => updateField('ucc', e.target.value.toUpperCase())}
                  placeholder="Unique Client Code"
                  className="font-mono uppercase"
                  data-testid="client-ucc"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">Occupation</Label>
                <Input
                  value={formData.occupation}
                  onChange={(e) => updateField('occupation', e.target.value)}
                  placeholder="Service / Business / etc."
                  data-testid="client-occupation"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">Date of Birth</Label>
                <Input
                  type="date"
                  value={formData.date_of_birth}
                  onChange={(e) => updateField('date_of_birth', e.target.value)}
                  data-testid="client-dob"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">Father/Husband's Name</Label>
                <Input
                  value={formData.father_husband_name}
                  onChange={(e) => updateField('father_husband_name', e.target.value)}
                  placeholder="Father/Husband's Name"
                  data-testid="client-father-name"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">Demat Account No</Label>
                <Input
                  value={formData.demat_account_no}
                  onChange={(e) => updateField('demat_account_no', e.target.value)}
                  placeholder="Demat Account Number"
                  className="font-mono"
                  data-testid="client-demat"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">Email *</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="email@example.com"
                  data-testid="client-email"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">Mobile *</Label>
                <Input
                  type="tel"
                  value={formData.mobile}
                  onChange={(e) => updateField('mobile', e.target.value)}
                  placeholder="+91 9876543210"
                  data-testid="client-mobile"
                  required
                />
              </div>
            </div>
          </div>

          {/* Address Details */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="h-5 w-5 text-amber-600" />
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Address Details</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label className="text-xs text-gray-500 uppercase">Address Line 1</Label>
                <Input
                  value={formData.address_line1}
                  onChange={(e) => updateField('address_line1', e.target.value)}
                  placeholder="Street Address"
                  data-testid="client-address1"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label className="text-xs text-gray-500 uppercase">Address Line 2</Label>
                <Input
                  value={formData.address_line2}
                  onChange={(e) => updateField('address_line2', e.target.value)}
                  placeholder="Apartment, Suite, etc."
                  data-testid="client-address2"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">City</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => updateField('city', e.target.value)}
                  placeholder="City"
                  data-testid="client-city"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">State</Label>
                <Select value={formData.state} onValueChange={(v) => updateField('state', v)}>
                  <SelectTrigger data-testid="client-state">
                    <SelectValue placeholder="Select State" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDIAN_STATES.map(state => (
                      <SelectItem key={state} value={state}>{state}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">Country</Label>
                <Input
                  value={formData.country}
                  onChange={(e) => updateField('country', e.target.value)}
                  placeholder="Country"
                  data-testid="client-country"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">Pincode</Label>
                <Input
                  value={formData.pincode}
                  onChange={(e) => updateField('pincode', e.target.value)}
                  placeholder="400001"
                  maxLength={6}
                  className="font-mono"
                  data-testid="client-pincode"
                />
              </div>
            </div>
          </div>

          {/* Bank Details */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="h-5 w-5 text-amber-600" />
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Bank Details</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">Bank Name</Label>
                <Input
                  value={formData.bank_name}
                  onChange={(e) => updateField('bank_name', e.target.value)}
                  placeholder="HDFC Bank"
                  data-testid="client-bank-name"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">Account Number</Label>
                <Input
                  value={formData.account_number}
                  onChange={(e) => updateField('account_number', e.target.value)}
                  placeholder="Account Number"
                  className="font-mono"
                  data-testid="client-account-number"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">Branch</Label>
                <Input
                  value={formData.branch}
                  onChange={(e) => updateField('branch', e.target.value)}
                  placeholder="Branch Name"
                  data-testid="client-branch"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">IFSC Code</Label>
                <Input
                  value={formData.ifsc_code}
                  onChange={(e) => updateField('ifsc_code', e.target.value.toUpperCase())}
                  placeholder="HDFC0000001"
                  maxLength={11}
                  className="font-mono uppercase"
                  data-testid="client-ifsc"
                />
              </div>
            </div>
          </div>

          {/* Nominee Details */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-5 w-5 text-amber-600" />
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Nominee Details</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">Nominee Name</Label>
                <Input
                  value={formData.nominee_name}
                  onChange={(e) => updateField('nominee_name', e.target.value)}
                  placeholder="Nominee Full Name"
                  data-testid="client-nominee-name"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">Date of Birth</Label>
                <Input
                  type="date"
                  value={formData.nominee_dob}
                  onChange={(e) => updateField('nominee_dob', e.target.value)}
                  data-testid="client-nominee-dob"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">Mobile No</Label>
                <Input
                  type="tel"
                  value={formData.nominee_mobile}
                  onChange={(e) => updateField('nominee_mobile', e.target.value)}
                  placeholder="+91 9876543210"
                  data-testid="client-nominee-mobile"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">Relationship</Label>
                <Select value={formData.nominee_relationship} onValueChange={(v) => updateField('nominee_relationship', v)}>
                  <SelectTrigger data-testid="client-nominee-relationship">
                    <SelectValue placeholder="Select Relationship" />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIPS.map(rel => (
                      <SelectItem key={rel} value={rel}>{rel}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Document Upload */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-5 w-5 text-amber-600" />
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Document Upload</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">PAN Upload</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => handleFileChange('pan', e.target.files?.[0])}
                    className="hidden"
                    id="pan-upload"
                    data-testid="client-pan-upload"
                  />
                  <label 
                    htmlFor="pan-upload" 
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-amber-500 hover:bg-amber-50 transition-colors"
                  >
                    <Upload className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600">
                      {documents.pan ? documents.pan.name : "Choose file"}
                    </span>
                  </label>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">Aadhar Upload</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => handleFileChange('aadhar', e.target.files?.[0])}
                    className="hidden"
                    id="aadhar-upload"
                    data-testid="client-aadhar-upload"
                  />
                  <label 
                    htmlFor="aadhar-upload" 
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-amber-500 hover:bg-amber-50 transition-colors"
                  >
                    <Upload className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600">
                      {documents.aadhar ? documents.aadhar.name : "Choose file"}
                    </span>
                  </label>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">Bank Cheque Upload</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => handleFileChange('bank_cheque', e.target.files?.[0])}
                    className="hidden"
                    id="bank-cheque-upload"
                    data-testid="client-bank-cheque-upload"
                  />
                  <label 
                    htmlFor="bank-cheque-upload" 
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-amber-500 hover:bg-amber-50 transition-colors"
                  >
                    <Upload className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600">
                      {documents.bank_cheque ? documents.bank_cheque.name : "Choose file"}
                    </span>
                  </label>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">CNL Upload</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => handleFileChange('cnl', e.target.files?.[0])}
                    className="hidden"
                    id="cnl-upload"
                    data-testid="client-cnl-upload"
                  />
                  <label 
                    htmlFor="cnl-upload" 
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-amber-500 hover:bg-amber-50 transition-colors"
                  >
                    <Upload className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600">
                      {documents.cnl ? documents.cnl.name : "Choose file"}
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Link to Sub-broker */}
          {subbrokers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Users className="h-5 w-5 text-amber-600" />
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Link to Sub-Broker (Optional)</h3>
              </div>
              <Select value={formData.linked_subbroker_id || "none"} onValueChange={(v) => updateField('linked_subbroker_id', v === "none" ? "" : v)}>
                <SelectTrigger data-testid="client-subbroker-link">
                  <SelectValue placeholder="Select Sub-Broker (Optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {subbrokers.map(sb => (
                    <SelectItem key={sb.id} value={sb.id}>{sb.name} ({sb.partner_code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-amber-700 hover:bg-amber-800"
            data-testid="create-client-submit"
          >
            {loading ? "Adding..." : "Add Client"}
          </Button>
        </div>
      </div>
    </div>
  );
}
