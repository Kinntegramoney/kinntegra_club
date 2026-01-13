import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Check, User, MapPin, Building2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const COUNTRIES = ["India", "United States", "United Kingdom", "UAE", "Singapore"];
const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

const COLORS = [
  { name: "Brown", value: "#78716C" },
  { name: "Blue", value: "#3B82F6" },
  { name: "Green", value: "#10B981" },
  { name: "Purple", value: "#8B5CF6" },
  { name: "Red", value: "#EF4444" },
  { name: "Orange", value: "#F59E0B" },
  { name: "Pink", value: "#EC4899" },
  { name: "Teal", value: "#14B8A6" }
];

const STEPS = [
  { id: 'general', label: 'General Information', icon: User },
  { id: 'address', label: 'Address Details', icon: MapPin },
  { id: 'bank', label: 'Bank Details', icon: Building2 },
];

export default function CreateSubBroker() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [currentStep, setCurrentStep] = useState('general');
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    // General Info
    name: "",
    pan: "",
    partner_code: "",
    email: "",
    mobile: "",
    color: "#78716C",
    // Address
    address_line1: "",
    address_line2: "",
    city: "",
    country: "India",
    state: "",
    pincode: "",
    // Bank Details
    bank_name: "",
    account_number: "",
    ifsc_code: "",
    branch: ""
  });

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "broker") {
      navigate("/login");
      return;
    }
    setUser(parsedUser);
  }, [navigate]);

  const getStepIndex = () => STEPS.findIndex(s => s.id === currentStep);
  
  const getProgress = () => {
    const stepIndex = getStepIndex();
    // Calculate progress based on current step and filled fields
    const baseProgress = (stepIndex / STEPS.length) * 100;
    return Math.round(baseProgress);
  };

  const isStepComplete = (stepId) => {
    switch (stepId) {
      case 'general':
        return formData.name && formData.pan && formData.partner_code && formData.email && formData.mobile;
      case 'address':
        return formData.address_line1 && formData.city && formData.country && formData.state && formData.pincode;
      case 'bank':
        return true; // Bank details are optional
      default:
        return false;
    }
  };

  const handleProceed = () => {
    const stepIndex = getStepIndex();
    if (!isStepComplete(currentStep)) {
      toast.error("Please fill all required fields");
      return;
    }
    if (stepIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[stepIndex + 1].id);
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const password = `partner${Math.random().toString(36).slice(2, 10)}`;
      const pin = Math.floor(1000 + Math.random() * 9000).toString();
      
      await axios.post(`${API}/partners`, {
        ...formData,
        password,
        pin
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success(`Sub-broker created! Password: ${password}, PIN: ${pin}`);
      navigate("/broker/admin/sub-brokers");
    } catch (error) {
      console.error("Error creating partner:", error);
      toast.error(error.response?.data?.detail || "Failed to create sub-broker");
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  const progress = getProgress();

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Sidebar - Step Navigation */}
      <div className="w-72 bg-white border-r border-gray-200 flex flex-col">
        {/* Go Back */}
        <div className="p-4 border-b border-gray-100">
          <button
            onClick={() => navigate("/broker/admin/sub-brokers")}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
            data-testid="go-back-btn"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm font-medium">Go Back</span>
          </button>
        </div>

        {/* Progress Circle */}
        <div className="p-6 flex flex-col items-center">
          <div className="relative w-24 h-24">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="40"
                fill="none"
                stroke="#f3f4f6"
                strokeWidth="6"
              />
              <circle
                cx="48"
                cy="48"
                r="40"
                fill="none"
                stroke="#10B981"
                strokeWidth="6"
                strokeDasharray={`${progress * 2.51} 251`}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold text-gray-800">{progress}%</span>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-500 uppercase tracking-wide">Completion</p>
        </div>

        {/* Steps Navigation */}
        <nav className="flex-1 px-4 space-y-1">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isComplete = isStepComplete(step.id);
            const isPast = getStepIndex() > index;

            return (
              <button
                key={step.id}
                onClick={() => setCurrentStep(step.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-left ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : isPast || isComplete
                    ? 'text-gray-600 hover:bg-gray-50'
                    : 'text-gray-400'
                }`}
                data-testid={`step-${step.id}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isActive
                    ? 'bg-emerald-100'
                    : isPast || isComplete
                    ? 'bg-emerald-100'
                    : 'bg-gray-100'
                }`}>
                  {isPast || isComplete ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Icon className={`h-4 w-4 ${isActive ? 'text-emerald-600' : 'text-gray-400'}`} />
                  )}
                </div>
                <span className={`text-sm font-medium ${isActive ? 'text-emerald-700' : ''}`}>
                  {step.label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* User Info */}
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <span className="text-amber-700 font-semibold">{user?.name?.charAt(0)}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{user?.name}</p>
              <p className="text-xs text-gray-500">Broker</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-800">Create New Sub-Broker</h1>
            <p className="text-gray-500 mt-1">Add a new sub-broker partner to your network</p>
          </div>

          {/* Step Content */}
          <div className="flex gap-8">
            {/* Form Section */}
            <div className="flex-1">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-6 flex items-center gap-2">
                  {STEPS.find(s => s.id === currentStep)?.icon && (
                    <span className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                      {(() => {
                        const Icon = STEPS.find(s => s.id === currentStep)?.icon;
                        return Icon ? <Icon className="h-4 w-4 text-emerald-600" /> : null;
                      })()}
                    </span>
                  )}
                  {STEPS.find(s => s.id === currentStep)?.label}
                </h2>

                {/* General Information */}
                {currentStep === 'general' && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-500 uppercase tracking-wide">Name (as per PAN) *</Label>
                        <Input
                          value={formData.name}
                          onChange={(e) => setFormData({...formData, name: e.target.value})}
                          placeholder="Enter full name"
                          className="border-gray-200 focus:border-emerald-500 focus:ring-emerald-500"
                          data-testid="input-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-500 uppercase tracking-wide">PAN Number *</Label>
                        <Input
                          value={formData.pan}
                          onChange={(e) => setFormData({...formData, pan: e.target.value.toUpperCase()})}
                          placeholder="ABCDE1234F"
                          maxLength={10}
                          className="font-mono border-gray-200 focus:border-emerald-500 focus:ring-emerald-500"
                          data-testid="input-pan"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-500 uppercase tracking-wide">Partner Code *</Label>
                        <Input
                          value={formData.partner_code}
                          onChange={(e) => setFormData({...formData, partner_code: e.target.value})}
                          placeholder="e.g., SB001"
                          className="border-gray-200 focus:border-emerald-500 focus:ring-emerald-500"
                          data-testid="input-partner-code"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-500 uppercase tracking-wide">Email *</Label>
                        <Input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({...formData, email: e.target.value})}
                          placeholder="partner@example.com"
                          className="border-gray-200 focus:border-emerald-500 focus:ring-emerald-500"
                          data-testid="input-email"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-500 uppercase tracking-wide">Mobile Number *</Label>
                        <Input
                          type="tel"
                          value={formData.mobile}
                          onChange={(e) => setFormData({...formData, mobile: e.target.value})}
                          placeholder="+91 98765 43210"
                          className="border-gray-200 focus:border-emerald-500 focus:ring-emerald-500"
                          data-testid="input-mobile"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-500 uppercase tracking-wide">Choose Color *</Label>
                        <div className="flex gap-2 pt-1">
                          {COLORS.map((color) => (
                            <button
                              key={color.value}
                              type="button"
                              onClick={() => setFormData({...formData, color: color.value})}
                              className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${
                                formData.color === color.value ? 'border-gray-800 scale-110 ring-2 ring-offset-2 ring-gray-300' : 'border-transparent'
                              }`}
                              style={{ backgroundColor: color.value }}
                              title={color.name}
                              data-testid={`color-${color.name.toLowerCase()}`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Address Details */}
                {currentStep === 'address' && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-500 uppercase tracking-wide">Address Line 1 *</Label>
                        <Input
                          value={formData.address_line1}
                          onChange={(e) => setFormData({...formData, address_line1: e.target.value})}
                          placeholder="Street address"
                          className="border-gray-200 focus:border-emerald-500 focus:ring-emerald-500"
                          data-testid="input-address1"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-500 uppercase tracking-wide">Address Line 2</Label>
                        <Input
                          value={formData.address_line2}
                          onChange={(e) => setFormData({...formData, address_line2: e.target.value})}
                          placeholder="Apartment, suite, etc."
                          className="border-gray-200 focus:border-emerald-500 focus:ring-emerald-500"
                          data-testid="input-address2"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-500 uppercase tracking-wide">City *</Label>
                        <Input
                          value={formData.city}
                          onChange={(e) => setFormData({...formData, city: e.target.value})}
                          placeholder="Enter city"
                          className="border-gray-200 focus:border-emerald-500 focus:ring-emerald-500"
                          data-testid="input-city"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-500 uppercase tracking-wide">Country *</Label>
                        <Select value={formData.country} onValueChange={(value) => setFormData({...formData, country: value})}>
                          <SelectTrigger className="border-gray-200 focus:border-emerald-500 focus:ring-emerald-500" data-testid="select-country">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COUNTRIES.map(country => (
                              <SelectItem key={country} value={country}>{country}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-500 uppercase tracking-wide">State *</Label>
                        <Select value={formData.state} onValueChange={(value) => setFormData({...formData, state: value})}>
                          <SelectTrigger className="border-gray-200 focus:border-emerald-500 focus:ring-emerald-500" data-testid="select-state">
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
                        <Label className="text-xs text-gray-500 uppercase tracking-wide">Pincode *</Label>
                        <Input
                          value={formData.pincode}
                          onChange={(e) => setFormData({...formData, pincode: e.target.value})}
                          placeholder="400001"
                          maxLength={6}
                          className="font-mono border-gray-200 focus:border-emerald-500 focus:ring-emerald-500"
                          data-testid="input-pincode"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Bank Details */}
                {currentStep === 'bank' && (
                  <div className="space-y-5">
                    <p className="text-sm text-gray-500 mb-4">Bank details are optional. You can add them later.</p>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-500 uppercase tracking-wide">Bank Name</Label>
                        <Input
                          value={formData.bank_name}
                          onChange={(e) => setFormData({...formData, bank_name: e.target.value})}
                          placeholder="e.g., HDFC Bank"
                          className="border-gray-200 focus:border-emerald-500 focus:ring-emerald-500"
                          data-testid="input-bank-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-500 uppercase tracking-wide">Account Number</Label>
                        <Input
                          value={formData.account_number}
                          onChange={(e) => setFormData({...formData, account_number: e.target.value})}
                          placeholder="Enter account number"
                          className="font-mono border-gray-200 focus:border-emerald-500 focus:ring-emerald-500"
                          data-testid="input-account-number"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-500 uppercase tracking-wide">IFSC Code</Label>
                        <Input
                          value={formData.ifsc_code}
                          onChange={(e) => setFormData({...formData, ifsc_code: e.target.value.toUpperCase()})}
                          placeholder="e.g., HDFC0001234"
                          className="font-mono border-gray-200 focus:border-emerald-500 focus:ring-emerald-500"
                          data-testid="input-ifsc"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-500 uppercase tracking-wide">Branch</Label>
                        <Input
                          value={formData.branch}
                          onChange={(e) => setFormData({...formData, branch: e.target.value})}
                          placeholder="Enter branch name"
                          className="border-gray-200 focus:border-emerald-500 focus:ring-emerald-500"
                          data-testid="input-branch"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Button */}
                <div className="mt-8 flex justify-end">
                  <Button
                    onClick={handleProceed}
                    disabled={loading}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-2.5 rounded-lg font-medium flex items-center gap-2"
                    data-testid="proceed-btn"
                  >
                    {loading ? "Creating..." : getStepIndex() === STEPS.length - 1 ? "Create Sub-Broker" : "Proceed"}
                    {!loading && <ChevronRight className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            {/* Illustration */}
            <div className="hidden lg:block w-64">
              <div className="sticky top-8">
                <svg viewBox="0 0 200 200" className="w-full">
                  {/* Decorative illustration */}
                  <circle cx="100" cy="100" r="80" fill="#ecfdf5" />
                  <circle cx="100" cy="100" r="60" fill="#d1fae5" />
                  <rect x="70" y="70" width="60" height="80" rx="4" fill="#10b981" />
                  <rect x="75" y="80" width="50" height="4" rx="2" fill="#ffffff" opacity="0.7" />
                  <rect x="75" y="90" width="40" height="4" rx="2" fill="#ffffff" opacity="0.7" />
                  <rect x="75" y="100" width="45" height="4" rx="2" fill="#ffffff" opacity="0.7" />
                  <rect x="75" y="110" width="35" height="4" rx="2" fill="#ffffff" opacity="0.7" />
                  <rect x="75" y="125" width="20" height="15" rx="2" fill="#ffffff" opacity="0.9" />
                  <circle cx="140" cy="60" r="25" fill="#fef3c7" />
                  <path d="M130 60 L140 50 L150 60 L140 70 Z" fill="#f59e0b" />
                  <circle cx="60" cy="140" r="20" fill="#dbeafe" />
                  <rect x="50" y="130" width="20" height="20" rx="2" fill="#3b82f6" />
                </svg>
                <p className="text-center text-sm text-gray-500 mt-4">
                  Add your sub-broker partners to expand your network
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
