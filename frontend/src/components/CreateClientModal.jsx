import { useState } from "react";
import axios from "axios";
import { X, User, MapPin, Building2, Users, FileText, Upload, Copy, Check, AlertTriangle, Plus, Trash2, Globe, CreditCard, Briefcase } from "lucide-react";
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

export default function CreateClientModal({ onClose, onSuccess, subbrokers = [] }) {
  const [loading, setLoading] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [credentials, setCredentials] = useState({ photo_id: "", password: "", pin: "", name: "", email: "" });
  const [copiedField, setCopiedField] = useState(null);
  const [uccList, setUccList] = useState([""]);
  const [currentStep, setCurrentStep] = useState(1);
  
  const [formData, setFormData] = useState({
    // Step 1: Basic Info
    name: "",
    email: "",
    mobile: "",
    country_of_residency: "",
    passport_type: "", // "indian" or "foreign"
    
    // Step 2: ID Details
    pan_number: "",
    passport_number: "",
    emirates_id: "",
    
    // Step 3: Opportunities
    opportunities: [], // ["bonds", "real_estate", "gift_city"]
    
    // Step 4: Conditional Fields
    // For Bonds - Indian Bank Details
    demat_account_no: "",
    bank_name: "",
    account_number: "",
    branch: "",
    ifsc_code: "",
    account_type: "", // Savings, Current for Indian residents; NRE, NRO, Savings, Current for NRIs
    
    // For NRI (Indian Passport + Non-India Residency) - UAE/International Bank Details
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

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast.success("Copied to clipboard!");
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

  // Validation for each step
  const validateStep = (step) => {
    switch (step) {
      case 1:
        if (!formData.name || !formData.email || !formData.mobile) {
          toast.error("Please fill in Name, Email, and Mobile");
          return false;
        }
        if (!formData.country_of_residency) {
          toast.error("Please select Country of Residency");
          return false;
        }
        if (!formData.passport_type) {
          toast.error("Please select Passport Type");
          return false;
        }
        return true;
      
      case 2:
        if (formData.passport_type === "indian" && !formData.pan_number) {
          toast.error("PAN Number is required for Indian passport holders");
          return false;
        }
        if (formData.passport_type === "foreign" && !formData.passport_number) {
          toast.error("Passport Number is required for foreign passport holders");
          return false;
        }
        if (isUAEResident() && !formData.emirates_id) {
          toast.error("Emirates ID is required for UAE residents");
          return false;
        }
        return true;
      
      case 3:
        if (formData.opportunities.length === 0) {
          toast.error("Please select at least one opportunity type");
          return false;
        }
        return true;
      
      case 4:
        if (formData.opportunities.includes("bonds")) {
          if (!formData.bank_name || !formData.account_number || !formData.ifsc_code) {
            toast.error("Bank details are required for Bond investments");
            return false;
          }
        }
        if (formData.opportunities.includes("real_estate")) {
          if (!formData.passport_valid_from || !formData.passport_valid_until || !formData.passport_country_of_issue) {
            toast.error("Passport validity details are required for Real Estate investments");
            return false;
          }
        }
        return true;
      
      default:
        return true;
    }
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 5));
    }
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate all steps
    for (let i = 1; i <= 4; i++) {
      if (!validateStep(i)) {
        setCurrentStep(i);
        return;
      }
    }

    // Filter valid UCCs
    const validUccs = uccList.filter(ucc => ucc.trim() !== "");
    if (validUccs.length > 0) {
      const uniqueUccs = [...new Set(validUccs)];
      if (uniqueUccs.length !== validUccs.length) {
        toast.error("Duplicate UCCs are not allowed");
        return;
      }
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const submitData = {
        ...formData,
        ucc_list: formData.opportunities.includes("bonds") ? validUccs : [],
        linked_subbroker_id: formData.linked_subbroker_id || null
      };
      
      const response = await axios.post(`${API}/clients`, submitData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const clientData = response.data;
      const photoId = formData.passport_type === "indian" 
        ? formData.pan_number.toUpperCase() 
        : formData.passport_number.toUpperCase();
      
      setCredentials({
        name: formData.name,
        photo_id: photoId,
        email: formData.email,
        password: clientData.default_password || "kinntegra123",
        pin: clientData.default_pin || "1234",
        passport_type: formData.passport_type
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
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-4 text-white">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Check className="h-6 w-6" />
              Client Created Successfully!
            </h2>
          </div>

          <div className="p-6 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-semibold">Important: Save these credentials!</p>
                <p>Please share these login details with the client.</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-gray-700 mb-3">Login Credentials for {credentials.name}</h3>
              
              {/* Photo ID (Username) */}
              <div className="flex items-center justify-between bg-white rounded-md p-3 border">
                <div>
                  <p className="text-xs text-gray-500 uppercase">
                    {credentials.passport_type === "indian" ? "PAN (Username)" : "Passport No (Username)"}
                  </p>
                  <p className="font-mono font-semibold text-lg">{credentials.photo_id}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(credentials.photo_id, 'photo_id')}>
                  {copiedField === 'photo_id' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>

              {/* Password */}
              <div className="flex items-center justify-between bg-white rounded-md p-3 border">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Password</p>
                  <p className="font-mono font-semibold text-lg">{credentials.password}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(credentials.password, 'password')}>
                  {copiedField === 'password' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>

              {/* PIN */}
              <div className="flex items-center justify-between bg-white rounded-md p-3 border">
                <div>
                  <p className="text-xs text-gray-500 uppercase">PIN (2-Step Verification)</p>
                  <p className="font-mono font-semibold text-lg">{credentials.pin}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(credentials.pin, 'pin')}>
                  {copiedField === 'pin' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>

              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={() => copyToClipboard(
                  `Login Credentials for ${credentials.name}\n\n${credentials.passport_type === "indian" ? "PAN" : "Passport"} (Username): ${credentials.photo_id}\nPassword: ${credentials.password}\nPIN: ${credentials.pin}\n\nLogin URL: https://kinntegraa.club/login`,
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
              I&apos;ve Saved the Credentials - Close
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Step indicator
  const steps = [
    { num: 1, label: "Basic Info" },
    { num: 2, label: "ID Details" },
    { num: 3, label: "Opportunities" },
    { num: 4, label: "Additional" },
    { num: 5, label: "Review" }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-amber-50">
          <h2 className="text-xl font-bold text-gray-800">Create New Client</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" data-testid="close-create-client-modal">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-6 py-4 bg-gray-50 border-b">
          <div className="flex items-center justify-between">
            {steps.map((step, idx) => (
              <div key={step.num} className="flex items-center">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                  currentStep >= step.num 
                    ? "bg-amber-600 text-white" 
                    : "bg-gray-200 text-gray-500"
                }`}>
                  {step.num}
                </div>
                <span className={`ml-2 text-sm hidden sm:inline ${currentStep >= step.num ? "text-amber-700 font-medium" : "text-gray-500"}`}>
                  {step.label}
                </span>
                {idx < steps.length - 1 && (
                  <div className={`w-8 sm:w-16 h-0.5 mx-2 ${currentStep > step.num ? "bg-amber-600" : "bg-gray-200"}`} />
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
                <User className="h-5 w-5 text-amber-600" />
                <h3 className="text-lg font-semibold text-gray-800">Basic Information</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase">Name *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="Full Name"
                    data-testid="client-name"
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
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase">Country of Residency *</Label>
                  <Select value={formData.country_of_residency} onValueChange={(v) => updateField('country_of_residency', v)}>
                    <SelectTrigger data-testid="client-country-residency">
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
                    onClick={() => {
                      updateField('passport_type', 'indian');
                      updateField('opportunities', []);
                    }}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      formData.passport_type === 'indian'
                        ? 'border-amber-500 bg-amber-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    data-testid="passport-type-indian"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        formData.passport_type === 'indian' ? 'bg-amber-500 text-white' : 'bg-gray-100'
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
                    onClick={() => {
                      updateField('passport_type', 'foreign');
                      updateField('opportunities', []);
                    }}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      formData.passport_type === 'foreign'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    data-testid="passport-type-foreign"
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
                <CreditCard className="h-5 w-5 text-amber-600" />
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
                        data-testid="client-pan"
                      />
                      <p className="text-xs text-gray-400">This will be used as the login ID</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500 uppercase">Passport Number (Optional)</Label>
                      <Input
                        value={formData.passport_number}
                        onChange={(e) => updateField('passport_number', e.target.value.toUpperCase())}
                        placeholder="A1234567"
                        className="font-mono uppercase"
                        data-testid="client-passport"
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
                      data-testid="client-passport"
                    />
                    <p className="text-xs text-gray-400">This will be used as the login ID</p>
                  </div>
                )}

                {isUAEResident() && (
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Emirates ID *</Label>
                    <Input
                      value={formData.emirates_id}
                      onChange={(e) => updateField('emirates_id', e.target.value)}
                      placeholder="784-XXXX-XXXXXXX-X"
                      className="font-mono"
                      data-testid="client-emirates-id"
                    />
                    <p className="text-xs text-gray-400">Required for UAE residents</p>
                  </div>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> The {formData.passport_type === "indian" ? "PAN Number" : "Passport Number"} will be used as the login ID for this client.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Opportunities */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <Briefcase className="h-5 w-5 text-amber-600" />
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
                        ? 'border-amber-500 bg-amber-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => toggleOpportunity(opp.id)}
                    data-testid={`opportunity-${opp.id}`}
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

              {formData.passport_type === "indian" && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="text-sm text-amber-800">
                    <strong>Indian Passport Holders:</strong> Can invest in Bonds/NCD and Real Estate.
                  </p>
                </div>
              )}

              {formData.passport_type === "foreign" && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    <strong>Foreign Passport Holders:</strong> Can invest in Real Estate and GIFT City opportunities.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Conditional Fields */}
          {currentStep === 4 && (
            <div className="space-y-6">
              {/* For Bonds - Bank & UCC Details */}
              {formData.opportunities.includes("bonds") && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Building2 className="h-5 w-5 text-amber-600" />
                    <h3 className="text-lg font-semibold text-gray-800">Bank & Investment Details</h3>
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded">Required for Bonds</span>
                  </div>

                  {/* Indian Bank Details - For Indian Passport holders (both residents and NRIs) */}
                  {formData.passport_type === "indian" && (
                    <>
                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
                        <h4 className="font-medium text-orange-800 mb-3">
                          {formData.country_of_residency === "India" ? "Indian Bank Account" : "Indian Bank Account (for NRI)"}
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-xs text-gray-500 uppercase">Bank Name *</Label>
                            <Input
                              value={formData.bank_name}
                              onChange={(e) => updateField('bank_name', e.target.value)}
                              placeholder="HDFC Bank"
                              data-testid="client-bank-name"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-gray-500 uppercase">Account Number *</Label>
                            <Input
                              value={formData.account_number}
                              onChange={(e) => updateField('account_number', e.target.value)}
                              placeholder="Account Number"
                              className="font-mono"
                              data-testid="client-account-number"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-gray-500 uppercase">Account Type *</Label>
                            <Select value={formData.account_type} onValueChange={(v) => updateField('account_type', v)}>
                              <SelectTrigger data-testid="client-account-type">
                                <SelectValue placeholder="Select Account Type" />
                              </SelectTrigger>
                              <SelectContent>
                                {formData.country_of_residency === "India" ? (
                                  <>
                                    <SelectItem value="Savings">Savings</SelectItem>
                                    <SelectItem value="Current">Current</SelectItem>
                                  </>
                                ) : (
                                  <>
                                    <SelectItem value="NRE">NRE</SelectItem>
                                    <SelectItem value="NRO">NRO</SelectItem>
                                    <SelectItem value="Savings">Savings</SelectItem>
                                    <SelectItem value="Current">Current</SelectItem>
                                  </>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-gray-500 uppercase">IFSC Code *</Label>
                            <Input
                              value={formData.ifsc_code}
                              onChange={(e) => updateField('ifsc_code', e.target.value.toUpperCase())}
                              placeholder="HDFC0000001"
                              maxLength={11}
                              className="font-mono uppercase"
                              data-testid="client-ifsc"
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
                            <Label className="text-xs text-gray-500 uppercase">Demat Account No</Label>
                            <Input
                              value={formData.demat_account_no}
                              onChange={(e) => updateField('demat_account_no', e.target.value)}
                              placeholder="Demat Account Number"
                              className="font-mono"
                              data-testid="client-demat"
                            />
                          </div>
                        </div>
                      </div>

                      {/* International Bank Details - Only for NRIs (Indian Passport + Non-India Residency) */}
                      {formData.country_of_residency !== "India" && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                          <h4 className="font-medium text-blue-800 mb-3">International Bank Account (UAE/Foreign)</h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-xs text-gray-500 uppercase">Bank Name *</Label>
                              <Input
                                value={formData.intl_bank_name}
                                onChange={(e) => updateField('intl_bank_name', e.target.value)}
                                placeholder="Commercial Bank of Dubai"
                                data-testid="client-intl-bank-name"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs text-gray-500 uppercase">Account Number *</Label>
                              <Input
                                value={formData.intl_account_number}
                                onChange={(e) => updateField('intl_account_number', e.target.value)}
                                placeholder="1007997925"
                                className="font-mono"
                                data-testid="client-intl-account-number"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs text-gray-500 uppercase">IBAN *</Label>
                              <Input
                                value={formData.intl_iban}
                                onChange={(e) => updateField('intl_iban', e.target.value.toUpperCase())}
                                placeholder="AE690230000001007997925"
                                className="font-mono uppercase"
                                data-testid="client-intl-iban"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs text-gray-500 uppercase">SWIFT Code *</Label>
                              <Input
                                value={formData.intl_swift_code}
                                onChange={(e) => updateField('intl_swift_code', e.target.value.toUpperCase())}
                                placeholder="CBDUAEAD"
                                className="font-mono uppercase"
                                data-testid="client-intl-swift"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Foreign Passport - Only International Bank Details */}
                  {formData.passport_type === "foreign" && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                      <h4 className="font-medium text-blue-800 mb-3">International Bank Account</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-500 uppercase">Bank Name *</Label>
                          <Input
                            value={formData.intl_bank_name}
                            onChange={(e) => updateField('intl_bank_name', e.target.value)}
                            placeholder="Commercial Bank of Dubai"
                            data-testid="client-intl-bank-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-500 uppercase">Account Number *</Label>
                          <Input
                            value={formData.intl_account_number}
                            onChange={(e) => updateField('intl_account_number', e.target.value)}
                            placeholder="1007997925"
                            className="font-mono"
                            data-testid="client-intl-account-number"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-500 uppercase">IBAN *</Label>
                          <Input
                            value={formData.intl_iban}
                            onChange={(e) => updateField('intl_iban', e.target.value.toUpperCase())}
                            placeholder="AE690230000001007997925"
                            className="font-mono uppercase"
                            data-testid="client-intl-iban"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-500 uppercase">SWIFT Code *</Label>
                          <Input
                            value={formData.intl_swift_code}
                            onChange={(e) => updateField('intl_swift_code', e.target.value.toUpperCase())}
                            placeholder="CBDUAEAD"
                            className="font-mono uppercase"
                            data-testid="client-intl-swift"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* UCC Section */}
                  <div className="space-y-2 pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-gray-500 uppercase">UCC (Unique Client Codes) - Max 5</Label>
                      {uccList.length < 5 && (
                        <Button type="button" variant="ghost" size="sm" onClick={addUccField} className="h-6 px-2 text-amber-600">
                          <Plus className="h-3 w-3 mr-1" /> Add UCC
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {uccList.map((ucc, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Input
                            value={ucc}
                            onChange={(e) => updateUcc(index, e.target.value)}
                            placeholder={`UCC ${index + 1}`}
                            className="font-mono uppercase"
                            data-testid={`client-ucc-${index + 1}`}
                          />
                          {uccList.length > 1 && (
                            <Button type="button" variant="ghost" size="sm" onClick={() => removeUccField(index)} className="h-8 w-8 p-0 text-red-500">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* For Real Estate - Passport Details */}
              {formData.opportunities.includes("real_estate") && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Globe className="h-5 w-5 text-blue-600" />
                    <h3 className="text-lg font-semibold text-gray-800">Passport Validity Details</h3>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">Required for Real Estate</span>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500 uppercase">Valid From *</Label>
                      <Input
                        type="date"
                        value={formData.passport_valid_from}
                        onChange={(e) => updateField('passport_valid_from', e.target.value)}
                        data-testid="client-passport-valid-from"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500 uppercase">Valid Until *</Label>
                      <Input
                        type="date"
                        value={formData.passport_valid_until}
                        onChange={(e) => updateField('passport_valid_until', e.target.value)}
                        data-testid="client-passport-valid-until"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500 uppercase">Country of Issue *</Label>
                      <Select value={formData.passport_country_of_issue} onValueChange={(v) => updateField('passport_country_of_issue', v)}>
                        <SelectTrigger data-testid="client-passport-country">
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

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800">
                      <strong>Note:</strong> You will receive a notification 3 months before the passport expires to request updated documents from the client.
                    </p>
                  </div>
                </div>
              )}

              {/* Additional Personal Details */}
              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center gap-2 mb-4">
                  <User className="h-5 w-5 text-gray-600" />
                  <h3 className="text-lg font-semibold text-gray-800">Additional Details (Optional)</h3>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Occupation</Label>
                    <Input value={formData.occupation} onChange={(e) => updateField('occupation', e.target.value)} placeholder="Service / Business" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Date of Birth</Label>
                    <Input type="date" value={formData.date_of_birth} onChange={(e) => updateField('date_of_birth', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Father/Husband Name</Label>
                    <Input value={formData.father_husband_name} onChange={(e) => updateField('father_husband_name', e.target.value)} placeholder="Name" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Review & Additional Info */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="h-5 w-5 text-amber-600" />
                <h3 className="text-lg font-semibold text-gray-800">Review & Additional Information</h3>
              </div>

              {/* Summary Card */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-gray-700">Client Summary</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-gray-500">Name:</span> <span className="font-medium">{formData.name}</span></div>
                  <div><span className="text-gray-500">Email:</span> <span className="font-medium">{formData.email}</span></div>
                  <div><span className="text-gray-500">Mobile:</span> <span className="font-medium">{formData.mobile}</span></div>
                  <div><span className="text-gray-500">Residency:</span> <span className="font-medium">{formData.country_of_residency}</span></div>
                  <div><span className="text-gray-500">Passport Type:</span> <span className="font-medium capitalize">{formData.passport_type}</span></div>
                  <div><span className="text-gray-500">Login ID:</span> <span className="font-mono font-medium">{formData.passport_type === "indian" ? formData.pan_number : formData.passport_number}</span></div>
                  <div className="col-span-2"><span className="text-gray-500">Opportunities:</span> <span className="font-medium">{formData.opportunities.join(", ")}</span></div>
                </div>
              </div>

              {/* Address Details */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-gray-600" />
                  <h4 className="font-semibold text-gray-700">Address Details (Optional)</h4>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label className="text-xs text-gray-500 uppercase">Address Line 1</Label>
                    <Input value={formData.address_line1} onChange={(e) => updateField('address_line1', e.target.value)} placeholder="Street Address" />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label className="text-xs text-gray-500 uppercase">Address Line 2</Label>
                    <Input value={formData.address_line2} onChange={(e) => updateField('address_line2', e.target.value)} placeholder="Apartment, Suite" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">City</Label>
                    <Input value={formData.city} onChange={(e) => updateField('city', e.target.value)} placeholder="City" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">State</Label>
                    <Select value={formData.state} onValueChange={(v) => updateField('state', v)}>
                      <SelectTrigger><SelectValue placeholder="Select State" /></SelectTrigger>
                      <SelectContent>
                        {INDIAN_STATES.map(state => (<SelectItem key={state} value={state}>{state}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Country</Label>
                    <Input value={formData.country} onChange={(e) => updateField('country', e.target.value)} placeholder="Country" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Pincode</Label>
                    <Input value={formData.pincode} onChange={(e) => updateField('pincode', e.target.value)} placeholder="400001" maxLength={10} className="font-mono" />
                  </div>
                </div>
              </div>

              {/* Nominee Details */}
              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-gray-600" />
                  <h4 className="font-semibold text-gray-700">Nominee Details (Optional)</h4>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Nominee Name</Label>
                    <Input value={formData.nominee_name} onChange={(e) => updateField('nominee_name', e.target.value)} placeholder="Nominee Full Name" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Relationship</Label>
                    <Select value={formData.nominee_relationship} onValueChange={(v) => updateField('nominee_relationship', v)}>
                      <SelectTrigger><SelectValue placeholder="Select Relationship" /></SelectTrigger>
                      <SelectContent>
                        {RELATIONSHIPS.map(rel => (<SelectItem key={rel} value={rel}>{rel}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Date of Birth</Label>
                    <Input type="date" value={formData.nominee_dob} onChange={(e) => updateField('nominee_dob', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase">Mobile</Label>
                    <Input type="tel" value={formData.nominee_mobile} onChange={(e) => updateField('nominee_mobile', e.target.value)} placeholder="+91 9876543210" />
                  </div>
                </div>
              </div>

              {/* Sub-broker Link */}
              {subbrokers.length > 0 && (
                <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-gray-600" />
                    <h4 className="font-semibold text-gray-700">Link to Sub-Broker (Optional)</h4>
                  </div>
                  <Select value={formData.linked_subbroker_id || "none"} onValueChange={(v) => updateField('linked_subbroker_id', v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Select Sub-Broker" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {subbrokers.map(sb => (<SelectItem key={sb.id} value={sb.id}>{sb.name} ({sb.partner_code})</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-between bg-gray-50">
          <Button type="button" variant="outline" onClick={currentStep === 1 ? onClose : prevStep} disabled={loading}>
            {currentStep === 1 ? "Cancel" : "Back"}
          </Button>
          
          {currentStep < 5 ? (
            <Button onClick={nextStep} className="bg-amber-700 hover:bg-amber-800" data-testid="next-step">
              Next Step
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading} className="bg-green-600 hover:bg-green-700" data-testid="create-client-submit">
              {loading ? "Creating..." : "Create Client"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
