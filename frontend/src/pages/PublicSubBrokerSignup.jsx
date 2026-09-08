import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { 
  User, Phone, Mail, ChevronLeft, CheckCircle2,
  Briefcase, FileText, CreditCard, Award, CheckCircle
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Indian States
const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Jammu and Kashmir", "Ladakh"
];

// Partner Type Options
const PARTNER_TYPES = [
  { value: "mfd", label: "MFD (Mutual Fund Distributor)", description: "AMFI registered distributor" },
  { value: "ria", label: "RIA (Registered Investment Advisor)", description: "SEBI registered advisor" },
  { value: "both", label: "Both MFD & RIA", description: "Dual registration" }
];

export default function PublicSubBrokerSignup() {
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // OTP verification states
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpResendTimer, setOtpResendTimer] = useState(0);
  
  const [formData, setFormData] = useState({
    // Personal Info
    full_name: "",
    email: "",
    mobile_number: "",
    
    // Partner Type
    partner_type: "", // mfd, ria, or both
    
    // Common Professional Info
    pan: "",
    
    // MFD specific fields
    arn: "", // AMFI Registration Number
    euin: "", // Employee Unique Identification Number
    
    // RIA specific fields
    sebi_registration_number: "", // SEBI RIA Registration Number
    registration_type: "", // Individual or Corporate
    
    // Address
    city: "",
    state: "",
    pincode: "",
    address: "",
    
    // Experience
    years_of_experience: "",
    current_aum: "", // Assets Under Management/Advisory
    
    // Additional
    about: "",
  });

  // Set page title
  useEffect(() => {
    document.title = "Kinntegraa | MFD/RIA Partner Registration";
  }, []);

  // OTP resend timer
  useEffect(() => {
    if (otpResendTimer > 0) {
      const timer = setTimeout(() => setOtpResendTimer(otpResendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpResendTimer]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const isMFD = formData.partner_type === "mfd" || formData.partner_type === "both";
  const isRIA = formData.partner_type === "ria" || formData.partner_type === "both";

  const isFormValid = () => {
    // Base validations
    const baseValid = (
      formData.full_name &&
      formData.email &&
      formData.mobile_number &&
      formData.pan &&
      formData.partner_type &&
      formData.city &&
      formData.state
    );
    
    if (!baseValid) return false;
    
    // MFD specific validation
    if (isMFD && !formData.arn) {
      return false;
    }
    
    // RIA specific validation
    if (isRIA && !formData.sebi_registration_number) {
      return false;
    }
    
    return true;
  };

  const handleSendOtp = async () => {
    if (!isFormValid()) {
      toast.error("Please fill all required fields");
      return;
    }
    
    setOtpSending(true);
    try {
      await axios.post(`${API}/mfd-ria/send-otp`, {
        email: formData.email,
        full_name: formData.full_name
      });
      setShowOtpInput(true);
      setOtpResendTimer(60);
      toast.success(`OTP sent to ${formData.email}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to send OTP");
    } finally {
      setOtpSending(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!otp || otp.length !== 6) {
      toast.error("Please enter a valid 6-digit OTP");
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`${API}/mfd-ria/register`, {
        ...formData,
        otp
      });
      setSubmitted(true);
      toast.success("Registration successful!");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  const getVerificationSteps = () => {
    if (formData.partner_type === "both") {
      return (
        <>
          1. Document Verification<br />
          2. ARN/EUIN Validation (MFD)<br />
          3. SEBI Registration Validation (RIA)<br />
          4. Account Activation<br />
          5. Welcome Email with Credentials
        </>
      );
    } else if (formData.partner_type === "ria") {
      return (
        <>
          1. Document Verification<br />
          2. SEBI Registration Validation<br />
          3. Account Activation<br />
          4. Welcome Email with Credentials
        </>
      );
    } else {
      return (
        <>
          1. Document Verification<br />
          2. ARN/EUIN Validation<br />
          3. Account Activation<br />
          4. Welcome Email with Credentials
        </>
      );
    }
  };

  // Success screen
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" 
           style={{ background: 'linear-gradient(135deg, #F5F5F0 0%, #E8E6E1 100%)' }}>
        <div className="w-full max-w-md text-center">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-3">Registration Submitted!</h1>
            <p className="text-gray-600 mb-6">
              Thank you for registering with Kinntegraa. Our team will verify your credentials and documents. 
              You'll receive an email within <span className="font-semibold">48 working hours</span> with your login credentials once approved.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-left">
              <p className="text-sm text-amber-800">
                <strong>What's Next?</strong><br />
                {getVerificationSteps()}
              </p>
            </div>
            <Button 
              onClick={() => navigate("/mf-distributors")}
              className="w-full"
              style={{ background: '#5B373C' }}
            >
              Back to MFD/RIA
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" 
         style={{ background: 'linear-gradient(135deg, #F5F5F0 0%, #E8E6E1 100%)' }}
         data-testid="mfd-ria-signup-page">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-6">
          <Link to="/mf-distributors" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to MFD/RIA
          </Link>
          <h1 className="text-3xl font-bold" style={{ color: '#1F2937' }}>MFD/RIA Partner Registration</h1>
          <p className="text-gray-500 mt-2">Partner with Kinntegraa as a Mutual Fund Distributor or Investment Advisor</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Personal Information */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide flex items-center gap-2">
                <User className="w-4 h-4" />
                Personal Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full Name *</Label>
                  <Input
                    id="full_name"
                    name="full_name"
                    value={formData.full_name}
                    onChange={handleChange}
                    placeholder="Enter your full name"
                    required
                    data-testid="mfd-ria-name-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="your.email@example.com"
                    required
                    data-testid="mfd-ria-email-input"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="mobile_number">Mobile Number *</Label>
                  <Input
                    id="mobile_number"
                    name="mobile_number"
                    value={formData.mobile_number}
                    onChange={handleChange}
                    placeholder="+91 XXXXX XXXXX"
                    required
                    data-testid="mfd-ria-phone-input"
                  />
                </div>
              </div>
            </div>

            {/* Partner Type Selection */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide flex items-center gap-2">
                <Briefcase className="w-4 h-4" />
                Partner Type *
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {PARTNER_TYPES.map((type) => {
                  const isSelected = formData.partner_type === type.value;
                  return (
                    <label 
                      key={type.value}
                      className={`flex flex-col p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        isSelected 
                          ? 'border-teal-500 bg-teal-50' 
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                      data-testid={`partner-type-${type.value}`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? 'border-teal-500 bg-teal-500' : 'border-gray-300'
                        }`}>
                          {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                        </div>
                        <span className={`text-sm font-semibold ${isSelected ? 'text-teal-700' : 'text-gray-700'}`}>
                          {type.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-2 ml-7">{type.description}</p>
                      <input
                        type="radio"
                        name="partner_type"
                        value={type.value}
                        checked={isSelected}
                        onChange={(e) => handleSelectChange("partner_type", e.target.value)}
                        className="sr-only"
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Common Professional Details */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Professional Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pan">PAN Number *</Label>
                  <Input
                    id="pan"
                    name="pan"
                    value={formData.pan}
                    onChange={handleChange}
                    placeholder="ABCDE1234F"
                    className="uppercase"
                    maxLength={10}
                    required
                    data-testid="mfd-ria-pan-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="years_of_experience">Years of Experience</Label>
                  <Select value={formData.years_of_experience} onValueChange={(v) => handleSelectChange("years_of_experience", v)}>
                    <SelectTrigger data-testid="mfd-ria-experience-select">
                      <SelectValue placeholder="Select experience" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0-2">0-2 Years</SelectItem>
                      <SelectItem value="2-5">2-5 Years</SelectItem>
                      <SelectItem value="5-10">5-10 Years</SelectItem>
                      <SelectItem value="10+">10+ Years</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* MFD Specific Fields */}
            {isMFD && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h3 className="text-sm font-semibold text-blue-800 mb-4 uppercase tracking-wide flex items-center gap-2">
                  <Award className="w-4 h-4" />
                  MFD Details (AMFI Registration)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="arn" className="text-blue-900">ARN Number *</Label>
                    <Input
                      id="arn"
                      name="arn"
                      value={formData.arn}
                      onChange={handleChange}
                      placeholder="ARN-XXXXXX"
                      className="bg-white"
                      data-testid="mfd-arn-input"
                    />
                    <p className="text-xs text-blue-600">AMFI Registration Number</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="euin" className="text-blue-900">EUIN</Label>
                    <Input
                      id="euin"
                      name="euin"
                      value={formData.euin}
                      onChange={handleChange}
                      placeholder="E-XXXXXX"
                      className="bg-white"
                      data-testid="mfd-euin-input"
                    />
                    <p className="text-xs text-blue-600">Employee Unique ID Number</p>
                  </div>
                </div>
              </div>
            )}

            {/* RIA Specific Fields */}
            {isRIA && (
              <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                <h3 className="text-sm font-semibold text-purple-800 mb-4 uppercase tracking-wide flex items-center gap-2">
                  <Award className="w-4 h-4" />
                  RIA Details (SEBI Registration)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="sebi_registration_number" className="text-purple-900">SEBI Registration No. *</Label>
                    <Input
                      id="sebi_registration_number"
                      name="sebi_registration_number"
                      value={formData.sebi_registration_number}
                      onChange={handleChange}
                      placeholder="INA000XXXXXX"
                      className="bg-white"
                      data-testid="ria-sebi-input"
                    />
                    <p className="text-xs text-purple-600">SEBI RIA Registration Number</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="registration_type" className="text-purple-900">Registration Type</Label>
                    <Select value={formData.registration_type} onValueChange={(v) => handleSelectChange("registration_type", v)}>
                      <SelectTrigger className="bg-white" data-testid="ria-type-select">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="individual">Individual RIA</SelectItem>
                        <SelectItem value="corporate">Corporate RIA</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {/* AUM Field (shown when partner type is selected) */}
            {formData.partner_type && (
              <div className="space-y-2">
                <Label htmlFor="current_aum">
                  {isRIA && !isMFD ? "Assets Under Advisory (Approx.)" : "Assets Under Management (Approx.)"}
                </Label>
                <Select value={formData.current_aum} onValueChange={(v) => handleSelectChange("current_aum", v)}>
                  <SelectTrigger data-testid="mfd-ria-aum-select">
                    <SelectValue placeholder="Select AUM range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="below_1cr">Below 1 Crore</SelectItem>
                    <SelectItem value="1-5cr">1-5 Crores</SelectItem>
                    <SelectItem value="5-10cr">5-10 Crores</SelectItem>
                    <SelectItem value="10-50cr">10-50 Crores</SelectItem>
                    <SelectItem value="50-100cr">50-100 Crores</SelectItem>
                    <SelectItem value="100cr+">100+ Crores</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Address Information */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Address Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City *</Label>
                  <Input
                    id="city"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    placeholder="Enter city"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State *</Label>
                  <Select value={formData.state} onValueChange={(v) => handleSelectChange("state", v)}>
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
                  <Label htmlFor="pincode">Pincode</Label>
                  <Input
                    id="pincode"
                    name="pincode"
                    value={formData.pincode}
                    onChange={handleChange}
                    placeholder="Enter pincode"
                    maxLength={6}
                  />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <Label htmlFor="address">Full Address</Label>
                <Textarea
                  id="address"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  placeholder="Enter your office/residence address"
                  rows={2}
                />
              </div>
            </div>

            {/* About */}
            <div>
              <div className="space-y-2">
                <Label htmlFor="about">Tell Us About Yourself</Label>
                <Textarea
                  id="about"
                  name="about"
                  value={formData.about}
                  onChange={handleChange}
                  placeholder="Share your experience, achievements, client base, etc..."
                  rows={3}
                />
              </div>
            </div>

            {/* OTP Section */}
            {showOtpInput ? (
              <div className="space-y-4 p-4 bg-teal-50 rounded-lg border border-teal-200">
                <div className="text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-teal-100 flex items-center justify-center">
                    <Mail className="w-6 h-6 text-teal-600" />
                  </div>
                  <h3 className="font-semibold text-gray-800">Verify Your Email</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    We've sent a 6-digit OTP to <span className="font-medium">{formData.email}</span>
                  </p>
                </div>
                
                <div>
                  <Label htmlFor="otp">Enter OTP *</Label>
                  <Input
                    id="otp"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter 6-digit OTP"
                    className="mt-1 text-center text-xl tracking-widest font-mono"
                    maxLength={6}
                    data-testid="mfd-ria-otp-input"
                  />
                </div>
                
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { setShowOtpInput(false); setOtp(""); }}
                    className="flex-1"
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting || otp.length !== 6}
                    className="flex-1"
                    style={{ background: '#5B373C' }}
                    data-testid="mfd-ria-submit-btn"
                  >
                    {submitting ? "Verifying..." : "Verify & Submit"}
                  </Button>
                </div>
                
                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={otpResendTimer > 0 || otpSending}
                    className={`text-sm ${otpResendTimer > 0 ? 'text-gray-400' : 'text-teal-600 hover:text-teal-700'}`}
                  >
                    {otpSending ? "Sending..." : otpResendTimer > 0 ? `Resend OTP in ${otpResendTimer}s` : "Resend OTP"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Submit Button */}
                <Button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={!isFormValid() || otpSending}
                  className="w-full h-12 text-base font-medium"
                  style={{ background: '#5B373C' }}
                  data-testid="mfd-ria-send-otp-btn"
                >
                  {otpSending ? "Sending OTP..." : "Continue"}
                </Button>

                {/* Note */}
                <p className="text-center text-xs text-gray-500">
                  By registering, you agree to our Terms of Service and Privacy Policy.
                  Your credentials will be verified before account activation.
                </p>
              </>
            )}
          </form>
        </div>

        {/* Company Info */}
        <div className="mt-6 text-center text-xs text-gray-500">
          <p className="font-semibold text-gray-600">Kinntegraa L.L.C-FZ</p>
          <p className="mt-1">License No: 2418465.01</p>
        </div>
      </div>
    </div>
  );
}
