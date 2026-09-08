import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { 
  User, Phone, Mail, ChevronLeft, CheckCircle2, Globe, CreditCard, FileText
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Countries for residency
const COUNTRIES = [
  "India",
  "United Arab Emirates",
  "United States",
  "United Kingdom",
  "Singapore",
  "Australia",
  "Canada",
  "Germany",
  "France",
  "Netherlands",
  "Switzerland",
  "Hong Kong",
  "Japan",
  "South Korea",
  "Malaysia",
  "Thailand",
  "Indonesia",
  "Philippines",
  "Saudi Arabia",
  "Qatar",
  "Kuwait",
  "Bahrain",
  "Oman",
  "Other"
];

// Passport types with descriptions
const PASSPORT_TYPES = [
  { value: "indian", label: "Indian Passport", description: "PAN required, access to NCD & Real Estate" },
  { value: "foreign", label: "Foreign Passport", description: "Passport required, access to Real Estate & GIFT City" }
];

export default function PublicLeadSignup() {
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // OTP states
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpResendTimer, setOtpResendTimer] = useState(0);
  
  // Form data - Step 1 Basic Information + Step 2 Identification
  const [formData, setFormData] = useState({
    // Step 1 - Basic Information
    full_name: "",
    email: "",
    mobile_number: "",
    country_of_residency: "",
    passport_type: "",
    // Step 2 - Identification Details
    pan_number: "",
    passport_number: ""
  });

  useEffect(() => {
    document.title = "Kinntegraa | Private Investor Registration";
  }, []);

  // OTP resend countdown timer
  useEffect(() => {
    if (otpResendTimer > 0) {
      const timer = setTimeout(() => setOtpResendTimer(otpResendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpResendTimer]);

  const isFormValid = () => {
    const basicFieldsValid = (
      formData.full_name.trim() &&
      formData.email.trim() &&
      formData.mobile_number.trim() &&
      formData.country_of_residency &&
      formData.passport_type
    );

    // Step 2 validation based on passport type
    if (!basicFieldsValid) return false;

    if (formData.passport_type === 'indian') {
      // PAN is required for Indian passport
      return formData.pan_number.trim().length === 10;
    } else if (formData.passport_type === 'foreign') {
      // Passport number is required for foreign passport
      return formData.passport_number.trim().length >= 6;
    }

    return false;
  };

  // Validate PAN format (Indian)
  const isValidPAN = (pan) => {
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    return panRegex.test(pan.toUpperCase());
  };

  const handleSendOtp = async () => {
    if (!isFormValid()) {
      toast.error("Please fill in all required fields");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast.error("Please enter a valid email address");
      return;
    }

    // Basic phone validation
    if (formData.mobile_number.length < 10) {
      toast.error("Please enter a valid mobile number");
      return;
    }

    // PAN validation for Indian passport holders
    if (formData.passport_type === 'indian' && !isValidPAN(formData.pan_number)) {
      toast.error("Please enter a valid PAN number (e.g., ABCDE1234F)");
      return;
    }
    
    setOtpSending(true);
    try {
      await axios.post(`${API}/private-investor/send-otp`, {
        email: formData.email,
        full_name: formData.full_name
      });
      setShowOtpInput(true);
      setOtpResendTimer(60);
      toast.success("OTP sent to your email. Please check your inbox.");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to send OTP. Please try again.");
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.length !== 6) {
      toast.error("Please enter a valid 6-digit OTP");
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`${API}/private-investor/register`, {
        ...formData,
        otp
      });
      setSubmitted(true);
      toast.success("Registration submitted successfully!");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpResendTimer > 0) return;
    
    setOtpSending(true);
    try {
      await axios.post(`${API}/private-investor/send-otp`, {
        email: formData.email,
        full_name: formData.full_name
      });
      setOtpResendTimer(60);
      setOtp("");
      toast.success("New OTP sent to your email.");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to resend OTP.");
    } finally {
      setOtpSending(false);
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
            <h1 className="text-2xl font-bold text-gray-800 mb-3">Thank You for Your Interest!</h1>
            <p className="text-gray-600 mb-6">
              We appreciate you reaching out to Kinntegraa. Our team will review your details and get back to you within <span className="font-semibold">48 working hours</span>.
            </p>
            <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-teal-800">
                Please check your email for further updates. We look forward to connecting with you soon.
              </p>
            </div>
            <Button 
              onClick={() => navigate("/private-investors")}
              className="w-full"
              style={{ background: '#5B373C' }}
            >
              Back to Private Investors
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" 
         style={{ background: 'linear-gradient(135deg, #F5F5F0 0%, #E8E6E1 100%)' }}
         data-testid="private-investor-signup-page">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <Link to="/private-investors" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Private Investors
          </Link>
          <h1 className="text-3xl font-bold" style={{ color: '#1F2937' }}>Private Investor Registration</h1>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
          <div className="space-y-5">
            {/* Full Name */}
            <div>
              <Label htmlFor="full_name" className="text-sm font-medium text-gray-700">
                Full Name *
              </Label>
              <div className="relative mt-1">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="full_name"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="Enter your full name"
                  className="pl-10"
                  data-testid="input-full-name"
                  disabled={showOtpInput}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                Email Address *
              </Label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="your.email@example.com"
                  className="pl-10"
                  data-testid="input-email"
                  disabled={showOtpInput}
                />
              </div>
            </div>

            {/* Mobile Number */}
            <div>
              <Label htmlFor="mobile_number" className="text-sm font-medium text-gray-700">
                Mobile Number *
              </Label>
              <div className="relative mt-1">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="mobile_number"
                  value={formData.mobile_number}
                  onChange={(e) => setFormData({ ...formData, mobile_number: e.target.value.replace(/[^\d+\s-]/g, '') })}
                  placeholder="+91 98765 43210"
                  className="pl-10"
                  data-testid="input-mobile"
                  disabled={showOtpInput}
                />
              </div>
            </div>

            {/* Country of Residency */}
            <div>
              <Label htmlFor="country_of_residency" className="text-sm font-medium text-gray-700">
                Country of Residency *
              </Label>
              <Select 
                value={formData.country_of_residency} 
                onValueChange={(v) => setFormData({ ...formData, country_of_residency: v })}
                disabled={showOtpInput}
              >
                <SelectTrigger className="mt-1" data-testid="select-country">
                  <Globe className="w-4 h-4 mr-2 text-gray-400" />
                  <SelectValue placeholder="Select your country" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((country) => (
                    <SelectItem key={country} value={country}>{country}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Passport Type */}
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-3 block">
                Passport Type *
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PASSPORT_TYPES.map((pt) => {
                  const isSelected = formData.passport_type === pt.value;
                  return (
                    <label 
                      key={pt.value}
                      className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        isSelected 
                          ? 'border-amber-500 bg-amber-50' 
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      } ${showOtpInput ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <div className={`w-5 h-5 mt-0.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'border-amber-500 bg-amber-500' : 'border-gray-300'
                      }`}>
                        {isSelected && <div className="w-2 h-2 rounded-full bg-white"></div>}
                      </div>
                      <div>
                        <p className={`text-sm font-semibold ${isSelected ? 'text-amber-700' : 'text-gray-700'}`}>
                          {pt.label}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">{pt.description}</p>
                      </div>
                      <input
                        type="radio"
                        name="passport_type"
                        value={pt.value}
                        checked={isSelected}
                        onChange={(e) => setFormData({ ...formData, passport_type: e.target.value, pan_number: "", passport_number: "" })}
                        className="sr-only"
                        disabled={showOtpInput}
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Step 2 - Identification Details (conditional based on passport type) */}
            {formData.passport_type && (
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                <h3 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  IDENTIFICATION DETAILS
                </h3>
                
                {formData.passport_type === 'indian' ? (
                  <div>
                    <Label htmlFor="pan_number" className="text-sm font-medium text-gray-700">
                      PAN Number *
                    </Label>
                    <div className="relative mt-1">
                      <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="pan_number"
                        value={formData.pan_number}
                        onChange={(e) => setFormData({ ...formData, pan_number: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) })}
                        placeholder="ABCDE1234F"
                        className="pl-10 uppercase font-mono"
                        maxLength={10}
                        data-testid="input-pan"
                        disabled={showOtpInput}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      PAN is required for NCD & Real Estate investments in India
                    </p>
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="passport_number" className="text-sm font-medium text-gray-700">
                      Passport Number *
                    </Label>
                    <div className="relative mt-1">
                      <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="passport_number"
                        value={formData.passport_number}
                        onChange={(e) => setFormData({ ...formData, passport_number: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                        placeholder="Enter your passport number"
                        className="pl-10 uppercase font-mono"
                        data-testid="input-passport"
                        disabled={showOtpInput}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Passport is required for Real Estate & GIFT City investments
                    </p>
                  </div>
                )}
              </div>
            )}

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
                    data-testid="input-otp"
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
                    type="button"
                    onClick={handleVerifyOtp}
                    disabled={submitting || otp.length !== 6}
                    className="flex-1"
                    style={{ background: '#5B373C' }}
                    data-testid="btn-verify-otp"
                  >
                    {submitting ? "Verifying..." : "Verify & Submit"}
                  </Button>
                </div>
                
                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleResendOtp}
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
                  data-testid="btn-submit"
                >
                  {otpSending ? "Sending OTP..." : "Submit"}
                </Button>

                {/* Note */}
                <p className="text-center text-xs text-gray-500">
                  By submitting, you agree to our Terms of Service and Privacy Policy.
                </p>
              </>
            )}
          </div>
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
