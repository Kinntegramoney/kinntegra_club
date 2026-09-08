import { useState } from "react";
import axios from "axios";
import { X, Copy, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Jammu and Kashmir", "Ladakh"
];

const PARTNER_TYPES = [
  { value: "mfd", label: "MFD (Mutual Fund Distributor)" },
  { value: "ria", label: "RIA (Registered Investment Advisor)" },
  { value: "both", label: "Both MFD & RIA" }
];

const EXPERIENCE_OPTIONS = [
  { value: "0-2", label: "0-2 Years" },
  { value: "2-5", label: "2-5 Years" },
  { value: "5-10", label: "5-10 Years" },
  { value: "10+", label: "10+ Years" }
];

const AUM_OPTIONS = [
  { value: "below_1cr", label: "Below 1 Crore" },
  { value: "1-5cr", label: "1-5 Crores" },
  { value: "5-10cr", label: "5-10 Crores" },
  { value: "10-50cr", label: "10-50 Crores" },
  { value: "50-100cr", label: "50-100 Crores" },
  { value: "100cr+", label: "100+ Crores" }
];

const RIA_TYPES = [
  { value: "individual", label: "Individual RIA" },
  { value: "corporate", label: "Corporate RIA" }
];

export default function CreatePartnerModal({ onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    // Personal Info
    name: "",
    pan: "",
    email: "",
    mobile: "",
    
    // Partner Type
    partner_type: "",
    
    // MFD specific fields
    arn: "",
    euin: "",
    
    // RIA specific fields
    sebi_registration_number: "",
    registration_type: "",
    
    // Address
    city: "",
    state: "",
    pincode: "",
    address: "",
    country: "India",
    
    // Experience
    years_of_experience: "",
    current_aum: "",
    
    // Additional
    about: "",
    
    // Legacy fields (for compatibility)
    partner_code: "",
    color: "#78716C"
  });
  const [loading, setLoading] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [credentials, setCredentials] = useState({ pan: "", password: "", pin: "", name: "", email: "" });
  const [copiedField, setCopiedField] = useState(null);

  const isMFD = formData.partner_type === "mfd" || formData.partner_type === "both";
  const isRIA = formData.partner_type === "ria" || formData.partner_type === "both";

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast.success("Copied to clipboard!");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate required fields
    const requiredFields = ['name', 'pan', 'email', 'mobile', 'partner_type', 'city', 'state'];
    const missingFields = requiredFields.filter(field => !formData[field]);
    
    if (missingFields.length > 0) {
      toast.error("Please fill all required fields");
      return;
    }

    // MFD validation
    if (isMFD && !formData.arn) {
      toast.error("ARN Number is required for MFD");
      return;
    }

    // RIA validation
    if (isRIA && !formData.sebi_registration_number) {
      toast.error("SEBI Registration Number is required for RIA");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      
      // Generate password and PIN for the partner
      const password = `partner${Math.random().toString(36).slice(2, 10)}`;
      const pin = Math.floor(1000 + Math.random() * 9000).toString();
      
      await axios.post(`${API}/partners`, {
        ...formData,
        partner_code: formData.partner_code || "",
        password,
        pin
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Show credentials modal instead of just a toast
      setCredentials({
        name: formData.name,
        pan: formData.pan.toUpperCase(),
        email: formData.email,
        password,
        pin
      });
      setShowCredentials(true);
      
    } catch (error) {
      console.error("Error creating partner:", error);
      toast.error(error.response?.data?.detail || "Failed to create partner");
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
              Partner Created Successfully!
            </h2>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            <div className="bg-etihad-gold-50 border border-etihad-gold-200 rounded-lg p-4 flex gap-3">
              <AlertTriangle className="h-5 w-5 text-etihad-gold-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-etihad-gold-800">
                <p className="font-semibold">Important: Save these credentials!</p>
                <p>Please share these login details with the partner. They will need these to access the portal.</p>
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold" style={{ color: '#78716C' }}>Add MFD/RIA Partner</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6">
          {/* PERSONAL INFORMATION */}
          <div className="mb-6">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">PERSONAL INFORMATION</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">FULL NAME *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="As per PAN card"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">PAN NUMBER *</Label>
                <Input
                  value={formData.pan}
                  onChange={(e) => setFormData({...formData, pan: e.target.value.toUpperCase()})}
                  maxLength={10}
                  className="font-mono"
                  placeholder="ABCDE1234F"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">EMAIL *</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="partner@example.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">MOBILE NUMBER *</Label>
                <Input
                  type="tel"
                  value={formData.mobile}
                  onChange={(e) => setFormData({...formData, mobile: e.target.value})}
                  placeholder="+91 98765 43210"
                  required
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label className="text-xs text-gray-500 uppercase">PARTNER CODE (Optional)</Label>
                <Input
                  value={formData.partner_code}
                  onChange={(e) => setFormData({...formData, partner_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')})}
                  placeholder="e.g., MFD001"
                  className="font-mono"
                  maxLength={15}
                />
              </div>
            </div>
          </div>

          {/* PARTNER TYPE */}
          <div className="mb-6">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">PARTNER TYPE *</h3>
            <div className="grid grid-cols-3 gap-3">
              {PARTNER_TYPES.map((pt) => {
                const isSelected = formData.partner_type === pt.value;
                return (
                  <label 
                    key={pt.value}
                    className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      isSelected 
                        ? 'border-purple-500 bg-purple-50' 
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      isSelected ? 'border-purple-500 bg-purple-500' : 'border-gray-300'
                    }`}>
                      {isSelected && <div className="w-2 h-2 rounded-full bg-white"></div>}
                    </div>
                    <span className={`text-sm font-medium ${isSelected ? 'text-purple-700' : 'text-gray-700'}`}>
                      {pt.label}
                    </span>
                    <input
                      type="radio"
                      name="partner_type"
                      value={pt.value}
                      checked={isSelected}
                      onChange={(e) => setFormData({...formData, partner_type: e.target.value, arn: "", euin: "", sebi_registration_number: "", registration_type: ""})}
                      className="sr-only"
                    />
                  </label>
                );
              })}
            </div>
          </div>

          {/* MFD DETAILS - Conditional */}
          {isMFD && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h3 className="text-xs font-medium text-blue-700 uppercase tracking-wider mb-4">MFD DETAILS (AMFI)</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase">ARN NUMBER *</Label>
                  <Input
                    value={formData.arn}
                    onChange={(e) => setFormData({...formData, arn: e.target.value.toUpperCase()})}
                    placeholder="ARN-XXXXXX"
                    className="font-mono"
                    required={isMFD}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase">EUIN (Optional)</Label>
                  <Input
                    value={formData.euin}
                    onChange={(e) => setFormData({...formData, euin: e.target.value.toUpperCase()})}
                    placeholder="E123456"
                    className="font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* RIA DETAILS - Conditional */}
          {isRIA && (
            <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
              <h3 className="text-xs font-medium text-purple-700 uppercase tracking-wider mb-4">RIA DETAILS (SEBI)</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase">SEBI REGISTRATION NUMBER *</Label>
                  <Input
                    value={formData.sebi_registration_number}
                    onChange={(e) => setFormData({...formData, sebi_registration_number: e.target.value.toUpperCase()})}
                    placeholder="INA000XXXXX"
                    className="font-mono"
                    required={isRIA}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase">REGISTRATION TYPE</Label>
                  <Select value={formData.registration_type} onValueChange={(value) => setFormData({...formData, registration_type: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {RIA_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* PROFESSIONAL DETAILS */}
          <div className="mb-6">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">PROFESSIONAL DETAILS</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">YEARS OF EXPERIENCE</Label>
                <Select value={formData.years_of_experience} onValueChange={(value) => setFormData({...formData, years_of_experience: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select experience" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPERIENCE_OPTIONS.map(exp => (
                      <SelectItem key={exp.value} value={exp.value}>{exp.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">CURRENT AUM</Label>
                <Select value={formData.current_aum} onValueChange={(value) => setFormData({...formData, current_aum: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select AUM range" />
                  </SelectTrigger>
                  <SelectContent>
                    {AUM_OPTIONS.map(aum => (
                      <SelectItem key={aum.value} value={aum.value}>{aum.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ADDRESS DETAILS */}
          <div className="mb-6">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">ADDRESS DETAILS</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">CITY *</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({...formData, city: e.target.value})}
                  placeholder="Mumbai"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">STATE *</Label>
                <Select value={formData.state} onValueChange={(value) => setFormData({...formData, state: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDIAN_STATES.map(state => (
                      <SelectItem key={state} value={state}>{state}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">PINCODE</Label>
                <Input
                  value={formData.pincode}
                  onChange={(e) => setFormData({...formData, pincode: e.target.value})}
                  maxLength={6}
                  className="font-mono"
                  placeholder="400001"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">COUNTRY</Label>
                <Input
                  value={formData.country}
                  onChange={(e) => setFormData({...formData, country: e.target.value})}
                  placeholder="India"
                  data-testid="partner-country-input"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label className="text-xs text-gray-500 uppercase">ADDRESS</Label>
                <Textarea
                  value={formData.address}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                  placeholder="Office/residential address"
                  rows={2}
                />
              </div>
            </div>
          </div>

          {/* ABOUT */}
          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">ABOUT (Optional)</h3>
            <Textarea
              value={formData.about}
              onChange={(e) => setFormData({...formData, about: e.target.value})}
              placeholder="Brief description about the partner..."
              rows={3}
            />
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="bg-etihad-gold-700 hover:bg-etihad-gold-800 text-white"
          >
            {loading ? "CREATING..." : "CREATE PARTNER"}
          </Button>
        </div>
      </div>
    </div>
  );
}