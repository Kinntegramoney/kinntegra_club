import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Check } from "lucide-react";
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
  { 
    id: 'partner', 
    label: 'PARTNER DETAILS',
    subItems: ['Name', 'PAN Number', 'Partner Code', 'Email', 'Mobile', 'Colour']
  },
  { 
    id: 'address', 
    label: 'ADDRESS DETAILS', 
    subItems: ['Address Line 1', 'Address Line 2', 'City', 'Country', 'State', 'Pincode'] 
  },
];

export default function CreateSubBroker() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [currentStep, setCurrentStep] = useState('partner');
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    pan: "",
    partner_code: "",
    email: "",
    mobile: "",
    color: "#78716C",
    address_line1: "",
    address_line2: "",
    city: "",
    country: "India",
    state: "",
    pincode: ""
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
    const totalFields = 11; // All required fields
    const filledFields = [
      formData.name, formData.pan, formData.partner_code, formData.email, formData.mobile,
      formData.address_line1, formData.address_line2, formData.city, formData.state, formData.pincode
    ].filter(v => v && v.trim() !== "").length;
    return Math.max(7, Math.round((filledFields / totalFields) * 100));
  };

  const isStepComplete = (stepId) => {
    switch (stepId) {
      case 'partner':
        return formData.name && formData.pan && formData.partner_code && formData.email && formData.mobile;
      case 'address':
        return formData.address_line1 && formData.address_line2 && formData.city && formData.state && formData.pincode;
      default:
        return false;
    }
  };

  const handleProceed = () => {
    const stepIndex = getStepIndex();
    
    // Validate current step
    if (currentStep === 'partner' && !isStepComplete('partner')) {
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
    // Validate all fields
    const requiredFields = ['name', 'pan', 'partner_code', 'email', 'mobile', 'address_line1', 'address_line2', 'city', 'state', 'pincode'];
    const missingFields = requiredFields.filter(field => !formData[field]);
    
    if (missingFields.length > 0) {
      toast.error("Please fill all required fields");
      return;
    }

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
    <div className="min-h-screen bg-white flex">
      {/* Left Sidebar */}
      <div className="w-64 border-r border-gray-100 flex flex-col">
        {/* Go Back */}
        <button
          onClick={() => navigate("/broker/admin/sub-brokers")}
          className="p-6 pb-2 flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors text-sm"
          data-testid="go-back-btn"
        >
          <ArrowLeft className="h-4 w-4" />
          Go Back
        </button>

        {/* Title */}
        <div className="px-6 py-4">
          <h1 className="text-lg font-semibold text-gray-800">Create New Sub-Broker</h1>
        </div>

        {/* Progress Circle */}
        <div className="px-6 py-4 flex items-center gap-4">
          <div className="relative w-20 h-20">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 80 80">
              <circle
                cx="40"
                cy="40"
                r="35"
                fill="none"
                stroke="#f3f4f6"
                strokeWidth="5"
              />
              <circle
                cx="40"
                cy="40"
                r="35"
                fill="none"
                stroke="#F5A962"
                strokeWidth="5"
                strokeDasharray={`${progress * 2.2} 220`}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold text-gray-700">{progress}%</span>
            </div>
          </div>
        </div>

        {/* Steps Navigation */}
        <nav className="flex-1 px-6 py-4">
          <div className="relative">
            {/* Vertical connecting line */}
            <div className="absolute left-[7px] top-3 bottom-3 w-px bg-gray-200" />
            
            <div className="space-y-2">
              {STEPS.map((step, index) => {
                const isActive = currentStep === step.id;
                const isComplete = isStepComplete(step.id);
                const isPast = getStepIndex() > index;

                return (
                  <div key={step.id}>
                    <button
                      onClick={() => setCurrentStep(step.id)}
                      className="w-full flex items-start gap-3 py-2 text-left relative z-10"
                      data-testid={`step-${step.id}`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                        isActive 
                          ? 'bg-teal-600 border-teal-600' 
                          : isPast || isComplete 
                          ? 'bg-teal-600 border-teal-600'
                          : 'bg-white border-gray-300'
                      }`}>
                        {(isPast || isComplete) && !isActive && (
                          <Check className="h-2.5 w-2.5 text-white" />
                        )}
                      </div>
                      <span className={`text-xs font-semibold tracking-wide ${
                        isActive ? 'text-gray-800' : 'text-gray-500'
                      }`}>
                        {step.label}
                      </span>
                    </button>
                    
                    {/* Sub-items */}
                    {step.subItems.length > 0 && isActive && (
                      <div className="ml-7 mt-1 space-y-1">
                        {step.subItems.map((subItem, subIndex) => (
                          <div 
                            key={subIndex}
                            className="text-xs text-gray-400 py-1"
                          >
                            {subItem}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Form Area */}
        <div className="flex-1 p-8 max-w-2xl">
          {/* Section Title */}
          <h2 className="text-2xl font-semibold text-gray-800 mb-8">
            {currentStep === 'partner' && 'Partner Details'}
            {currentStep === 'address' && 'Address Details'}
          </h2>

          {/* Partner Details Form */}
          {currentStep === 'partner' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase tracking-wide">
                    NAME (AS PER PAN CARD) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="h-12 border-gray-200 rounded-md"
                    data-testid="input-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase tracking-wide">
                    PAN NUMBER <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={formData.pan}
                    onChange={(e) => setFormData({...formData, pan: e.target.value.toUpperCase()})}
                    maxLength={10}
                    className="h-12 border-gray-200 rounded-md font-mono"
                    data-testid="input-pan"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase tracking-wide">
                    PARTNER CODE <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={formData.partner_code}
                    onChange={(e) => setFormData({...formData, partner_code: e.target.value})}
                    className="h-12 border-gray-200 rounded-md"
                    data-testid="input-partner-code"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase tracking-wide">
                    EMAIL <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="h-12 border-gray-200 rounded-md"
                    data-testid="input-email"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase tracking-wide">
                    MOBILE NO <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="tel"
                    value={formData.mobile}
                    onChange={(e) => setFormData({...formData, mobile: e.target.value})}
                    placeholder="+91 or Ext"
                    className="h-12 border-gray-200 rounded-md"
                    data-testid="input-mobile"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase tracking-wide">
                    CHOOSE COLOUR <span className="text-red-500">*</span>
                  </Label>
                  <div className="flex gap-2 pt-2">
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

          {/* Address Details Form */}
          {currentStep === 'address' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase tracking-wide">
                    ADDRESS LINE 1 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={formData.address_line1}
                    onChange={(e) => setFormData({...formData, address_line1: e.target.value})}
                    className="h-12 border-gray-200 rounded-md"
                    data-testid="input-address1"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase tracking-wide">
                    ADDRESS LINE 2 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={formData.address_line2}
                    onChange={(e) => setFormData({...formData, address_line2: e.target.value})}
                    className="h-12 border-gray-200 rounded-md"
                    data-testid="input-address2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase tracking-wide">
                    CITY <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={formData.city}
                    onChange={(e) => setFormData({...formData, city: e.target.value})}
                    className="h-12 border-gray-200 rounded-md"
                    data-testid="input-city"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 uppercase tracking-wide">
                    COUNTRY <span className="text-red-500">*</span>
                  </Label>
                  <Select value={formData.country} onValueChange={(value) => setFormData({...formData, country: value})}>
                    <SelectTrigger className="h-12 border-gray-200 rounded-md" data-testid="select-country">
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
                  <Label className="text-xs text-gray-500 uppercase tracking-wide">
                    STATE <span className="text-red-500">*</span>
                  </Label>
                  <Select value={formData.state} onValueChange={(value) => setFormData({...formData, state: value})}>
                    <SelectTrigger className="h-12 border-gray-200 rounded-md" data-testid="select-state">
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
                  <Label className="text-xs text-gray-500 uppercase tracking-wide">
                    PINCODE <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={formData.pincode}
                    onChange={(e) => setFormData({...formData, pincode: e.target.value})}
                    maxLength={6}
                    className="h-12 border-gray-200 rounded-md font-mono"
                    data-testid="input-pincode"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Proceed Button */}
          <div className="mt-10">
            <Button
              onClick={handleProceed}
              disabled={loading}
              className="bg-teal-700 hover:bg-teal-800 text-white px-8 py-3 h-12 rounded-md font-medium"
              data-testid="proceed-btn"
            >
              {loading ? "CREATING..." : getStepIndex() === STEPS.length - 1 ? "SAVE CHANGES" : "PROCEED"}
            </Button>
          </div>
        </div>

        {/* Right Illustration */}
        <div className="w-80 p-8 flex items-start justify-center">
          <div className="mt-16">
            <svg viewBox="0 0 300 350" className="w-64">
              {/* Background elements */}
              <rect x="60" y="30" width="180" height="140" rx="8" fill="#E8F4F8" />
              
              {/* Chart bars */}
              <rect x="80" y="100" width="25" height="50" rx="2" fill="#3B82F6" />
              <rect x="115" y="80" width="25" height="70" rx="2" fill="#3B82F6" />
              <rect x="150" y="60" width="25" height="90" rx="2" fill="#3B82F6" />
              <rect x="185" y="90" width="25" height="60" rx="2" fill="#3B82F6" />
              
              {/* Line chart */}
              <polyline 
                points="80,90 115,70 150,50 185,80 220,60" 
                fill="none" 
                stroke="#10B981" 
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              
              {/* Pie chart */}
              <circle cx="250" cy="80" r="35" fill="#FDE68A" />
              <path d="M250,80 L250,45 A35,35 0 0,1 280,95 Z" fill="#F59E0B" />
              <path d="M250,80 L280,95 A35,35 0 0,1 235,110 Z" fill="#FBBF24" />
              
              {/* Person shadow */}
              <ellipse cx="150" cy="320" rx="45" ry="8" fill="#E5E7EB" />
              
              {/* Body */}
              <path d="M120,250 Q150,230 180,250 L175,310 L125,310 Z" fill="#0D9488" />
              
              {/* Head */}
              <circle cx="150" cy="210" r="30" fill="#FDDCAB" />
              
              {/* Hair */}
              <path d="M125,195 Q150,175 175,195 Q170,185 150,185 Q130,185 125,195" fill="#1E3A5F" />
              
              {/* Face */}
              <circle cx="140" cy="210" r="2" fill="#1E3A5F" />
              <circle cx="160" cy="210" r="2" fill="#1E3A5F" />
              <path d="M145,220 Q150,225 155,220" fill="none" stroke="#1E3A5F" strokeWidth="2" strokeLinecap="round" />
              
              {/* Arms */}
              <path d="M125,260 L100,290" stroke="#FDDCAB" strokeWidth="12" strokeLinecap="round" />
              <path d="M175,260 L200,290" stroke="#FDDCAB" strokeWidth="12" strokeLinecap="round" />
              
              {/* Document */}
              <rect x="70" y="260" width="40" height="55" rx="4" fill="white" stroke="#E5E7EB" strokeWidth="2" />
              <line x1="80" y1="275" x2="100" y2="275" stroke="#3B82F6" strokeWidth="2" />
              <line x1="80" y1="285" x2="95" y2="285" stroke="#3B82F6" strokeWidth="2" />
              <line x1="80" y1="295" x2="100" y2="295" stroke="#3B82F6" strokeWidth="2" />
              
              {/* Plant */}
              <rect x="230" y="290" width="30" height="35" rx="4" fill="#FDE68A" />
              <ellipse cx="245" cy="275" rx="20" ry="15" fill="#10B981" />
              <ellipse cx="235" cy="265" rx="12" ry="10" fill="#34D399" />
              <ellipse cx="255" cy="268" rx="10" ry="8" fill="#34D399" />
            </svg>
          </div>
        </div>
      </div>

      {/* Top Right User Info */}
      <div className="absolute top-4 right-6 flex items-center gap-3">
        <span className="text-sm text-gray-600">{user?.name}</span>
        <div className="relative">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
            <span className="text-amber-700 font-semibold">{user?.name?.charAt(0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
