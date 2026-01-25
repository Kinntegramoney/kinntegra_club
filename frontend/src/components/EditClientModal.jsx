import { useState, useEffect } from "react";
import axios from "axios";
import { X, User, MapPin, Building2, Users, FileText, Upload, Copy, Check, AlertTriangle, Plus, Trash2, Globe, CreditCard, Briefcase, Home, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Countries list with UAE and India on top
const COUNTRIES = [
  "United Arab Emirates",
  "India",
  "---",
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Argentina", "Armenia", "Australia",
  "Austria", "Azerbaijan", "Bahrain", "Bangladesh", "Belarus", "Belgium", "Bhutan", "Bolivia",
  "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Cambodia", "Cameroon",
  "Canada", "Chile", "China", "Colombia", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic",
  "Denmark", "Ecuador", "Egypt", "Estonia", "Ethiopia", "Finland", "France", "Georgia", "Germany",
  "Ghana", "Greece", "Guatemala", "Hong Kong", "Hungary", "Iceland", "Indonesia", "Iran", "Iraq",
  "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kuwait",
  "Kyrgyzstan", "Latvia", "Lebanon", "Libya", "Lithuania", "Luxembourg", "Macau", "Malaysia",
  "Maldives", "Malta", "Mauritius", "Mexico", "Moldova", "Monaco", "Mongolia", "Montenegro",
  "Morocco", "Myanmar", "Nepal", "Netherlands", "New Zealand", "Nigeria", "North Korea", "Norway",
  "Oman", "Pakistan", "Palestine", "Panama", "Paraguay", "Peru", "Philippines", "Poland", "Portugal",
  "Qatar", "Romania", "Russia", "Saudi Arabia", "Serbia", "Singapore", "Slovakia", "Slovenia",
  "South Africa", "South Korea", "Spain", "Sri Lanka", "Sudan", "Sweden", "Switzerland", "Syria",
  "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Tunisia", "Turkey", "Turkmenistan", "Uganda",
  "Ukraine", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Venezuela", "Vietnam",
  "Yemen", "Zambia", "Zimbabwe"
];

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

const RELATIONSHIPS = ["Spouse", "Father", "Mother", "Son", "Daughter", "Brother", "Sister", "Other"];

export default function EditClientModal({ client, onClose, onSuccess, subbrokers = [] }) {
  const [loading, setLoading] = useState(false);
  const [uccList, setUccList] = useState([""]);
  const [currentStep, setCurrentStep] = useState(1);
  
  const [formData, setFormData] = useState({
    // Step 1: Basic Info
    name: "",
    email: "",
    mobile: "",
    country_of_residency: "",
    passport_type: "",
    
    // Step 2: ID Details
    pan_number: "",
    passport_number: "",
    emirates_id: "",
    
    // Step 3: Opportunities
    opportunities: [],
    
    // Step 4: Additional Fields
    // For Bonds - Indian Bank Details
    demat_account_no: "",
    bank_name: "",
    account_number: "",
    branch: "",
    ifsc_code: "",
    account_type: "",
    
    // For NRI - UAE/International Bank Details
    intl_iban: "",
    intl_account_number: "",
    intl_swift_code: "",
    intl_bank_name: "",
    
    // For Real Estate - Passport Details
    passport_valid_from: "",
    passport_valid_until: "",
    passport_country_of_issue: "",
    
    // Additional Details
    occupation: "",
    date_of_birth: "",
    father_husband_name: "",
    
    // Address Details
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    country: "",
    pincode: "",
    
    // Nominee Details
    nominee_name: "",
    nominee_dob: "",
    nominee_mobile: "",
    nominee_relationship: "",
    
    // Linked Sub-broker
    linked_subbroker_id: ""
  });

  // Load client data on mount
  useEffect(() => {
    if (client) {
      // Handle UCC list
      const uccs = client.ucc_list || client.uccs || (client.ucc ? [client.ucc] : [""]);
      setUccList(uccs.length > 0 ? uccs : [""]);
      
      setFormData({
        name: client.name || "",
        email: client.email || "",
        mobile: client.mobile || "",
        country_of_residency: client.country_of_residency || "",
        passport_type: client.passport_type || (client.pan_number ? "indian" : "foreign"),
        pan_number: client.pan_number || "",
        passport_number: client.passport_number || "",
        emirates_id: client.emirates_id || "",
        opportunities: client.opportunities || [],
        demat_account_no: client.demat_account_no || "",
        bank_name: client.bank_name || "",
        account_number: client.account_number || "",
        branch: client.branch || "",
        ifsc_code: client.ifsc_code || "",
        account_type: client.account_type || "",
        intl_iban: client.intl_iban || "",
        intl_account_number: client.intl_account_number || "",
        intl_swift_code: client.intl_swift_code || "",
        intl_bank_name: client.intl_bank_name || "",
        passport_valid_from: client.passport_valid_from?.split('T')[0] || "",
        passport_valid_until: client.passport_valid_until?.split('T')[0] || "",
        passport_country_of_issue: client.passport_country_of_issue || "",
        occupation: client.occupation || "",
        date_of_birth: client.date_of_birth?.split('T')[0] || "",
        father_husband_name: client.father_husband_name || "",
        address_line1: client.address_line1 || "",
        address_line2: client.address_line2 || "",
        city: client.city || "",
        state: client.state || "",
        country: client.country || "",
        pincode: client.pincode || "",
        nominee_name: client.nominee_name || "",
        nominee_dob: client.nominee_dob?.split('T')[0] || "",
        nominee_mobile: client.nominee_mobile || "",
        nominee_relationship: client.nominee_relationship || "",
        linked_subbroker_id: client.linked_subbroker_id || ""
      });
    }
  }, [client]);

  // UCC management functions
  const addUccField = () => {
    if (uccList.length < 5) {
      setUccList([...uccList, ""]);
    } else {
      toast.error("Maximum 5 UCCs allowed per client");
    }
  };

  const removeUccField = (index) => {
    if (uccList.length > 1) {
      const newList = uccList.filter((_, i) => i !== index);
      setUccList(newList);
    }
  };

  const updateUcc = (index, value) => {
    const newList = [...uccList];
    newList[index] = value.toUpperCase();
    setUccList(newList);
  };

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleOpportunity = (opp) => {
    setFormData(prev => {
      const current = prev.opportunities || [];
      if (current.includes(opp)) {
        return { ...prev, opportunities: current.filter(o => o !== opp) };
      } else {
        return { ...prev, opportunities: [...current, opp] };
      }
    });
  };

  // Get available opportunities based on passport type
  const getAvailableOpportunities = () => {
    if (formData.passport_type === "indian") {
      return [
        { id: "bonds", label: "Bonds / NCD", description: "Corporate debt instruments" },
        { id: "real_estate", label: "Real Estate", description: "Property investments" }
      ];
    } else if (formData.passport_type === "foreign") {
      return [
        { id: "real_estate", label: "Real Estate", description: "Property investments in UAE/Dubai" },
        { id: "gift_city", label: "GIFT City", description: "Gujarat International Finance Tec-City investments" }
      ];
    }
    return [];
  };

  // Check if UAE resident
  const isUAEResident = () => {
    const country = formData.country_of_residency?.toLowerCase();
    return country === "united arab emirates" || country === "uae";
  };

  // Check if NRI (Indian passport but not residing in India)
  const isNRI = () => {
    return formData.passport_type === "indian" && 
           formData.country_of_residency && 
           formData.country_of_residency !== "India";
  };

  const nextStep = () => {
    setCurrentStep(prev => Math.min(prev + 1, 5));
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Filter valid UCCs
    const validUccs = uccList.filter(ucc => ucc.trim() !== "");

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const submitData = {
        ...formData,
        ucc_list: formData.opportunities.includes("bonds") ? validUccs : [],
        linked_subbroker_id: formData.linked_subbroker_id || null
      };
      
      await axios.put(`${API}/clients/${client.id}`, submitData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success("Client updated successfully!");
      onSuccess();
      
    } catch (error) {
      console.error("Error updating client:", error);
      toast.error(error.response?.data?.detail || "Failed to update client");
    } finally {
      setLoading(false);
    }
  };

  // Step indicator
  const steps = [
    { num: 1, label: "Basic Info", icon: User },
    { num: 2, label: "ID Details", icon: CreditCard },
    { num: 3, label: "Opportunities", icon: Briefcase },
    { num: 4, label: "Additional", icon: FileText },
    { num: 5, label: "Review", icon: Check }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-etihad-gold-50">
          <h2 className="text-xl font-bold text-gray-800">Edit Client - {client?.name}</h2>
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
                  className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium cursor-pointer ${
                    currentStep >= step.num 
                      ? "bg-etihad-gold-600 text-white" 
                      : "bg-gray-200 text-gray-500"
                  }`}
                  onClick={() => setCurrentStep(step.num)}
                >
                  {step.num}
                </div>
                <span className={`ml-2 text-sm hidden sm:inline ${currentStep >= step.num ? "text-etihad-gold-700 font-medium" : "text-gray-500"}`}>
                  {step.label}
                </span>
                {idx < steps.length - 1 && (
                  <div className={`w-8 sm:w-16 h-0.5 mx-2 ${currentStep > step.num ? "bg-etihad-gold-600" : "bg-gray-200"}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Basic Info */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <User className="h-5 w-5 text-etihad-gold-600" />
                <h3 className="text-lg font-semibold text-gray-800">Basic Information</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase">Name *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="Full Name"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase">Email *</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase">Mobile *</Label>
                  <Input
                    type="tel"
                    value={formData.mobile}
                    onChange={(e) => updateField('mobile', e.target.value)}
                    placeholder="+91 9876543210"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase">Country of Residency *</Label>
                  <Select value={formData.country_of_residency} onValueChange={(v) => updateField('country_of_residency', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Country" />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.filter(c => c !== "---").map(country => (
                        <SelectItem key={country} value={country}>{country}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t">
                <Label className="text-xs text-gray-500 uppercase">Passport Type *</Label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => updateField('passport_type', 'indian')}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      formData.passport_type === 'indian'
                        ? 'border-etihad-gold-500 bg-etihad-gold-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        formData.passport_type === 'indian' ? 'bg-etihad-gold-500 text-white' : 'bg-gray-100'
                      }`}>
                        🇮🇳
                      </div>
                      <div>
                        <p className="font-semibold">Indian Passport</p>
                        <p className="text-xs text-gray-500">PAN required, access to Bonds & Real Estate</p>
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateField('passport_type', 'foreign')}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      formData.passport_type === 'foreign'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        formData.passport_type === 'foreign' ? 'bg-blue-500 text-white' : 'bg-gray-100'
                      }`}>
                        🌍
                      </div>
                      <div>
                        <p className="font-semibold">Foreign Passport</p>
                        <p className="text-xs text-gray-500">Passport required, access to Real Estate & GIFT City</p>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: ID Details */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="h-5 w-5 text-etihad-gold-600" />
                <h3 className="text-lg font-semibold text-gray-800">Identity Details</h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {formData.passport_type === "indian" && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500 uppercase">PAN Number * (Login ID)</Label>
                      <Input
                        value={formData.pan_number}
                        onChange={(e) => updateField('pan_number', e.target.value.toUpperCase())}
                        placeholder="ABCDE1234F"
                        maxLength={10}
                        className="font-mono uppercase"
                        disabled
                      />
                      <p className="text-xs text-gray-400">Login ID cannot be changed</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500 uppercase">Passport Number (Optional)</Label>
                      <Input
                        value={formData.passport_number}
                        onChange={(e) => updateField('passport_number', e.target.value.toUpperCase())}
                        placeholder="A1234567"
                        className="font-mono uppercase"
                      />
                    </div>
                  </>
                )}

                {formData.passport_type === "foreign" && (
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Passport Number * (Login ID)</Label>
                    <Input
                      value={formData.passport_number}
                      onChange={(e) => updateField('passport_number', e.target.value.toUpperCase())}
                      placeholder="A1234567"
                      className="font-mono uppercase"
                      disabled
                    />
                    <p className="text-xs text-gray-400">Login ID cannot be changed</p>
                  </div>
                )}

                {isUAEResident() && (
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Emirates ID</Label>
                    <Input
                      value={formData.emirates_id}
                      onChange={(e) => updateField('emirates_id', e.target.value)}
                      placeholder="784-XXXX-XXXXXXX-X"
                      className="font-mono"
                    />
                  </div>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> Login ID ({formData.passport_type === "indian" ? "PAN Number" : "Passport Number"}) cannot be modified.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Opportunities */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <Briefcase className="h-5 w-5 text-etihad-gold-600" />
                <h3 className="text-lg font-semibold text-gray-800">Investment Opportunities</h3>
              </div>

              <p className="text-gray-600">
                Select the investment opportunities this client should have access to:
              </p>

              <div className="grid gap-4">
                {getAvailableOpportunities().map(opp => (
                  <div
                    key={opp.id}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      formData.opportunities.includes(opp.id)
                        ? 'border-etihad-gold-500 bg-etihad-gold-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => toggleOpportunity(opp.id)}
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
                <FileText className="h-5 w-5 text-etihad-gold-600" />
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
                      placeholder="As per ID"
                    />
                  </div>
                </div>
              </div>

              {/* Bonds: UCCs & Indian Bank Details */}
              {formData.opportunities.includes("bonds") && (
                <div className="space-y-4 pt-4 border-t">
                  <h4 className="font-medium text-gray-700 flex items-center gap-2">
                    <Building2 className="h-4 w-4" /> Bond Investment Details
                  </h4>
                  
                  {/* UCCs */}
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">UCCs (Unique Client Codes)</Label>
                    <div className="space-y-2">
                      {uccList.map((ucc, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Input
                            value={ucc}
                            onChange={(e) => updateUcc(index, e.target.value)}
                            placeholder={`UCC ${index + 1}`}
                            className="font-mono uppercase"
                          />
                          {index > 0 && (
                            <Button type="button" variant="ghost" size="sm" onClick={() => removeUccField(index)} className="text-red-500">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      {uccList.length < 5 && (
                        <Button type="button" variant="outline" size="sm" onClick={addUccField} className="w-full">
                          <Plus className="h-4 w-4 mr-2" /> Add UCC
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500 uppercase">Demat Account No</Label>
                      <Input
                        value={formData.demat_account_no}
                        onChange={(e) => updateField('demat_account_no', e.target.value)}
                        placeholder="16-digit Demat Account"
                        className="font-mono"
                      />
                    </div>
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
                        value={formData.account_number}
                        onChange={(e) => updateField('account_number', e.target.value)}
                        placeholder="Bank Account Number"
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500 uppercase">Branch</Label>
                      <Input
                        value={formData.branch}
                        onChange={(e) => updateField('branch', e.target.value)}
                        placeholder="Branch Name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500 uppercase">IFSC Code</Label>
                      <Input
                        value={formData.ifsc_code}
                        onChange={(e) => updateField('ifsc_code', e.target.value.toUpperCase())}
                        placeholder="e.g., HDFC0001234"
                        className="font-mono uppercase"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500 uppercase">Account Type</Label>
                      <Select value={formData.account_type} onValueChange={(v) => updateField('account_type', v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Savings">Savings</SelectItem>
                          <SelectItem value="Current">Current</SelectItem>
                          {isNRI() && (
                            <>
                              <SelectItem value="NRE">NRE</SelectItem>
                              <SelectItem value="NRO">NRO</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {/* International Bank Details for NRI/Foreign */}
              {(isNRI() || formData.passport_type === "foreign") && formData.opportunities.includes("bonds") && (
                <div className="space-y-4 pt-4 border-t">
                  <h4 className="font-medium text-gray-700 flex items-center gap-2">
                    <Globe className="h-4 w-4" /> International Bank Details
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
                        value={formData.intl_account_number}
                        onChange={(e) => updateField('intl_account_number', e.target.value)}
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500 uppercase">IBAN</Label>
                      <Input
                        value={formData.intl_iban}
                        onChange={(e) => updateField('intl_iban', e.target.value.toUpperCase())}
                        className="font-mono uppercase"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500 uppercase">SWIFT Code</Label>
                      <Input
                        value={formData.intl_swift_code}
                        onChange={(e) => updateField('intl_swift_code', e.target.value.toUpperCase())}
                        className="font-mono uppercase"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Real Estate: Passport Validity */}
              {formData.opportunities.includes("real_estate") && (
                <div className="space-y-4 pt-4 border-t">
                  <h4 className="font-medium text-gray-700 flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Passport Validity (Real Estate)
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500 uppercase">Valid From</Label>
                      <Input
                        type="date"
                        value={formData.passport_valid_from}
                        onChange={(e) => updateField('passport_valid_from', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500 uppercase">Valid Until</Label>
                      <Input
                        type="date"
                        value={formData.passport_valid_until}
                        onChange={(e) => updateField('passport_valid_until', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500 uppercase">Country of Issue</Label>
                      <Select value={formData.passport_country_of_issue} onValueChange={(v) => updateField('passport_country_of_issue', v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Country" />
                        </SelectTrigger>
                        <SelectContent>
                          {COUNTRIES.filter(c => c !== "---").map(country => (
                            <SelectItem key={country} value={country}>{country}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {/* Address Details */}
              <div className="space-y-4 pt-4 border-t">
                <h4 className="font-medium text-gray-700 flex items-center gap-2">
                  <Home className="h-4 w-4" /> Address Details
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Address Line 1</Label>
                    <Input
                      value={formData.address_line1}
                      onChange={(e) => updateField('address_line1', e.target.value)}
                      placeholder="House/Flat No, Building Name"
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Address Line 2</Label>
                    <Input
                      value={formData.address_line2}
                      onChange={(e) => updateField('address_line2', e.target.value)}
                      placeholder="Street, Area"
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
                    <Select value={formData.state} onValueChange={(v) => updateField('state', v)}>
                      <SelectTrigger>
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
                    <Label className="text-xs text-gray-500 uppercase">Pincode</Label>
                    <Input
                      value={formData.pincode}
                      onChange={(e) => updateField('pincode', e.target.value)}
                      placeholder="6-digit Pincode"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Country</Label>
                    <Select value={formData.country || "India"} onValueChange={(v) => updateField('country', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Country" />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.filter(c => c !== "---").map(country => (
                          <SelectItem key={country} value={country}>{country}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Nominee Details */}
              <div className="space-y-4 pt-4 border-t">
                <h4 className="font-medium text-gray-700 flex items-center gap-2">
                  <Heart className="h-4 w-4" /> Nominee Details
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
                    <Label className="text-xs text-gray-500 uppercase">Nominee Date of Birth</Label>
                    <Input
                      type="date"
                      value={formData.nominee_dob}
                      onChange={(e) => updateField('nominee_dob', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Nominee Mobile</Label>
                    <Input
                      value={formData.nominee_mobile}
                      onChange={(e) => updateField('nominee_mobile', e.target.value)}
                      placeholder="Mobile Number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Relationship</Label>
                    <Select value={formData.nominee_relationship} onValueChange={(v) => updateField('nominee_relationship', v)}>
                      <SelectTrigger>
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

              {/* Sub-broker Assignment */}
              {subbrokers.length > 0 && (
                <div className="space-y-4 pt-4 border-t">
                  <h4 className="font-medium text-gray-700 flex items-center gap-2">
                    <Users className="h-4 w-4" /> Sub-broker Assignment
                  </h4>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Linked Sub-broker</Label>
                    <Select 
                      value={formData.linked_subbroker_id || "none"} 
                      onValueChange={(v) => updateField('linked_subbroker_id', v === "none" ? "" : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Sub-broker" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Sub-broker</SelectItem>
                        {subbrokers.map(sb => (
                          <SelectItem key={sb.id} value={sb.id}>{sb.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Review */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <Check className="h-5 w-5 text-etihad-gold-600" />
                <h3 className="text-lg font-semibold text-gray-800">Review & Save</h3>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Basic Info */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <User className="h-4 w-4" /> Basic Information
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Name:</span>
                      <span className="font-medium">{formData.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Email:</span>
                      <span className="font-medium">{formData.email}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Mobile:</span>
                      <span className="font-medium">{formData.mobile}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Residency:</span>
                      <span className="font-medium">{formData.country_of_residency}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Passport Type:</span>
                      <span className="font-medium capitalize">{formData.passport_type}</span>
                    </div>
                  </div>
                </div>

                {/* ID Details */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <CreditCard className="h-4 w-4" /> Identity Details
                  </h4>
                  <div className="space-y-2 text-sm">
                    {formData.passport_type === "indian" && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">PAN:</span>
                        <span className="font-mono font-medium">{formData.pan_number}</span>
                      </div>
                    )}
                    {formData.passport_number && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Passport:</span>
                        <span className="font-mono font-medium">{formData.passport_number}</span>
                      </div>
                    )}
                    {formData.emirates_id && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Emirates ID:</span>
                        <span className="font-mono font-medium">{formData.emirates_id}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Opportunities */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <Briefcase className="h-4 w-4" /> Investment Opportunities
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {formData.opportunities.map(opp => (
                      <span key={opp} className="px-3 py-1 bg-etihad-gold-100 text-etihad-gold-700 rounded-full text-sm font-medium capitalize">
                        {opp.replace('_', ' ')}
                      </span>
                    ))}
                    {formData.opportunities.length === 0 && (
                      <span className="text-gray-400 text-sm">No opportunities selected</span>
                    )}
                  </div>
                </div>

                {/* Bank Details Summary */}
                {formData.bank_name && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                      <Building2 className="h-4 w-4" /> Bank Details
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Bank:</span>
                        <span className="font-medium">{formData.bank_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Account:</span>
                        <span className="font-mono font-medium">{formData.account_number}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">IFSC:</span>
                        <span className="font-mono font-medium">{formData.ifsc_code}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
                <p className="text-sm text-green-800">
                  <strong>Ready to Save:</strong> Review the information above and click "Save Changes" to update the client profile.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
          <Button
            type="button"
            variant="outline"
            onClick={currentStep === 1 ? onClose : prevStep}
          >
            {currentStep === 1 ? "Cancel" : "Previous"}
          </Button>
          
          {currentStep < 5 ? (
            <Button
              type="button"
              onClick={nextStep}
              className="bg-etihad-gold-600 hover:bg-etihad-gold-700"
            >
              Next Step
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700"
            >
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
