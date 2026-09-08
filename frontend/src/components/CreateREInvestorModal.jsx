import { useState } from "react";
import axios from "axios";
import { X, User, Globe, CreditCard, FileText, Copy, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

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

export default function CreateREInvestorModal({ onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [credentials, setCredentials] = useState({ photo_id: "", password: "", pin: "", name: "", email: "" });
  const [copiedField, setCopiedField] = useState(null);
  const [currentStep, setCurrentStep] = useState(1);
  
  const [formData, setFormData] = useState({
    // Step 1: Basic Info
    name: "",
    email: "",
    mobile: "",
    country_of_residency: "",
    passport_type: "foreign", // Default to foreign for RE investors
    
    // Step 2: ID Details
    pan_number: "",
    passport_number: "",
    emirates_id: "",
    
    // Step 3: Passport Details for Real Estate
    passport_valid_from: "",
    passport_valid_until: "",
    passport_country_of_issue: "",
    
    // Step 4: Additional Details
    occupation: "",
    date_of_birth: "",
    address_line1: "",
    city: "",
    country: ""
  });

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast.success("Copied to clipboard!");
  };

  const isUAEResident = () => {
    const country = formData.country_of_residency?.toLowerCase();
    return country === "united arab emirates" || country === "uae";
  };

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
        if (!formData.passport_valid_from || !formData.passport_valid_until || !formData.passport_country_of_issue) {
          toast.error("Passport validity details are required for Real Estate investments");
          return false;
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
    
    for (let i = 1; i <= 3; i++) {
      if (!validateStep(i)) {
        setCurrentStep(i);
        return;
      }
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const submitData = {
        ...formData,
        opportunities: ["real_estate"]
      };
      
      const response = await axios.post(`${API}/re-broker/private-investors/create`, submitData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const investorData = response.data;
      const photoId = formData.passport_type === "indian" 
        ? formData.pan_number.toUpperCase() 
        : formData.passport_number.toUpperCase();
      
      setCredentials({
        name: formData.name,
        photo_id: photoId,
        email: formData.email,
        password: investorData.default_password || "kinntegra123",
        pin: investorData.default_pin || "1234",
        passport_type: formData.passport_type
      });
      setShowCredentials(true);
      
    } catch (error) {
      console.error("Error creating investor:", error);
      toast.error(error.response?.data?.detail || "Failed to create investor");
    } finally {
      setLoading(false);
    }
  };

  const handleCredentialsClose = () => {
    setShowCredentials(false);
    onSuccess({
      photo_id: credentials.photo_id,
      name: credentials.name,
      email: credentials.email
    });
  };

  // Credentials Modal
  if (showCredentials) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg w-full max-w-md overflow-hidden">
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-4 text-white">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Check className="h-6 w-6" />
              Investor Created Successfully!
            </h2>
          </div>

          <div className="p-6 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-semibold">Important: Save these credentials!</p>
                <p>Please share these login details with the investor.</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-gray-700 mb-3">Login Credentials for {credentials.name}</h3>
              
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

              <div className="flex items-center justify-between bg-white rounded-md p-3 border">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Password</p>
                  <p className="font-mono font-semibold text-lg">{credentials.password}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(credentials.password, 'password')}>
                  {copiedField === 'password' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>

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

  const steps = [
    { num: 1, label: "Basic Info" },
    { num: 2, label: "ID Details" },
    { num: 3, label: "Passport" },
    { num: 4, label: "Additional" },
    { num: 5, label: "Review" }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-blue-50">
          <h2 className="text-xl font-bold text-gray-800">Create New Investor</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" data-testid="close-create-investor-modal">
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
                    ? "bg-blue-600 text-white" 
                    : "bg-gray-200 text-gray-500"
                }`}>
                  {step.num}
                </div>
                <span className={`ml-2 text-sm hidden sm:inline ${currentStep >= step.num ? "text-blue-700 font-medium" : "text-gray-500"}`}>
                  {step.label}
                </span>
                {idx < steps.length - 1 && (
                  <div className={`w-8 sm:w-12 h-0.5 mx-2 ${currentStep > step.num ? "bg-blue-600" : "bg-gray-200"}`} />
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
                <User className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-800">Basic Information</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase">Name *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="Full Name"
                    data-testid="investor-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase">Email *</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    placeholder="email@example.com"
                    data-testid="investor-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase">Mobile *</Label>
                  <Input
                    type="tel"
                    value={formData.mobile}
                    onChange={(e) => updateField('mobile', e.target.value)}
                    placeholder="+91 9876543210"
                    data-testid="investor-mobile"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase">Country of Residency *</Label>
                  <Select value={formData.country_of_residency} onValueChange={(v) => updateField('country_of_residency', v)}>
                    <SelectTrigger data-testid="investor-country-residency">
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
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    data-testid="passport-type-indian"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                        formData.passport_type === 'indian' ? 'bg-orange-500 text-white' : 'bg-gray-100'
                      }`}>
                        IN
                      </div>
                      <div>
                        <p className="font-semibold">Indian Passport</p>
                        <p className="text-xs text-gray-500">PAN required, access to NCD & Real Estate</p>
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
                    data-testid="passport-type-foreign"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                        formData.passport_type === 'foreign' ? 'bg-blue-500 text-white' : 'bg-gray-100'
                      }`}>
                        FP
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
                <CreditCard className="h-5 w-5 text-blue-600" />
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
                        data-testid="investor-pan"
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
                        data-testid="investor-passport"
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
                      data-testid="investor-passport"
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
                      data-testid="investor-emirates-id"
                    />
                    <p className="text-xs text-gray-400">Required for UAE residents</p>
                  </div>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> The {formData.passport_type === "indian" ? "PAN Number" : "Passport Number"} will be used as the login ID for this investor.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Passport Details */}
          {currentStep === 3 && (
            <div className="space-y-6">
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
                    data-testid="investor-passport-valid-from"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase">Valid Until *</Label>
                  <Input
                    type="date"
                    value={formData.passport_valid_until}
                    onChange={(e) => updateField('passport_valid_until', e.target.value)}
                    data-testid="investor-passport-valid-until"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase">Country of Issue *</Label>
                  <Select value={formData.passport_country_of_issue} onValueChange={(v) => updateField('passport_country_of_issue', v)}>
                    <SelectTrigger data-testid="investor-passport-country">
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
                  <strong>Note:</strong> You will receive a notification 3 months before the passport expires to request updated documents from the investor.
                </p>
              </div>
            </div>
          )}

          {/* Step 4: Additional Details */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <User className="h-5 w-5 text-gray-600" />
                <h3 className="text-lg font-semibold text-gray-800">Additional Details (Optional)</h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase">Occupation</Label>
                  <Input 
                    value={formData.occupation} 
                    onChange={(e) => updateField('occupation', e.target.value)} 
                    placeholder="Service / Business" 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase">Date of Birth</Label>
                  <Input 
                    type="date" 
                    value={formData.date_of_birth} 
                    onChange={(e) => updateField('date_of_birth', e.target.value)} 
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label className="text-xs text-gray-500 uppercase">Address</Label>
                  <Input 
                    value={formData.address_line1} 
                    onChange={(e) => updateField('address_line1', e.target.value)} 
                    placeholder="Street Address" 
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
                  <Label className="text-xs text-gray-500 uppercase">Country</Label>
                  <Input 
                    value={formData.country} 
                    onChange={(e) => updateField('country', e.target.value)} 
                    placeholder="Country" 
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Review */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-800">Review Information</h3>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-gray-700">Investor Summary</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-gray-500">Name:</span> <span className="font-medium">{formData.name}</span></div>
                  <div><span className="text-gray-500">Email:</span> <span className="font-medium">{formData.email}</span></div>
                  <div><span className="text-gray-500">Mobile:</span> <span className="font-medium">{formData.mobile}</span></div>
                  <div><span className="text-gray-500">Residency:</span> <span className="font-medium">{formData.country_of_residency}</span></div>
                  <div><span className="text-gray-500">Passport Type:</span> <span className="font-medium capitalize">{formData.passport_type}</span></div>
                  <div>
                    <span className="text-gray-500">Login ID:</span> 
                    <span className="font-mono font-medium ml-1">
                      {formData.passport_type === "indian" ? formData.pan_number : formData.passport_number}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500">Passport Valid:</span> 
                    <span className="font-medium ml-1">{formData.passport_valid_from} to {formData.passport_valid_until}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500">Access:</span> 
                    <span className="font-medium ml-1">Real Estate Opportunities</span>
                  </div>
                </div>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-800">
                  <strong>Ready to create!</strong> Once created, login credentials will be generated automatically. 
                  Make sure to save and share them with the investor.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-between bg-gray-50">
          <Button type="button" variant="outline" onClick={currentStep === 1 ? onClose : prevStep} disabled={loading}>
            {currentStep === 1 ? "Cancel" : "Back"}
          </Button>
          
          {currentStep < 5 ? (
            <Button onClick={nextStep} className="bg-blue-600 hover:bg-blue-700" data-testid="next-step">
              Next Step
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading} className="bg-green-600 hover:bg-green-700" data-testid="create-investor-submit">
              {loading ? "Creating..." : "Create Investor"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
