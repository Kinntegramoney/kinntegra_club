import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { 
  User, Phone, Mail, MapPin, ChevronLeft, CheckCircle2,
  Building2, Globe, Award, Briefcase, FileText
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

// UAE Emirates for Dubai RE Brokers
const UAE_EMIRATES = [
  "Dubai",
  "Abu Dhabi", 
  "Sharjah",
  "Ajman",
  "Umm Al Quwain",
  "Ras Al Khaimah",
  "Fujairah"
];

// Specialization options
const SPECIALIZATIONS = [
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
  { value: "off_plan", label: "Off-Plan Projects" },
  { value: "luxury", label: "Luxury Properties" },
  { value: "both", label: "Residential & Commercial" }
];

// Experience ranges
const EXPERIENCE_RANGES = [
  { value: "0-2", label: "0-2 Years" },
  { value: "2-5", label: "2-5 Years" },
  { value: "5-10", label: "5-10 Years" },
  { value: "10+", label: "10+ Years" }
];

export default function PublicREBrokerSignup() {
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
    
    // Company Info
    company_name: "",
    rera_license_number: "",
    rera_expiry_date: "",
    
    // Location
    emirate: "Dubai",
    office_address: "",
    
    // Professional Info
    specialization: "",
    years_of_experience: "",
    team_size: "",
    
    // Additional
    website: "",
    linkedin_profile: "",
    about: "",
    
    // Areas of operation
    primary_areas: "",
  });

  // Set page title
  useEffect(() => {
    document.title = "Kinntegraa | Real Estate Broker Registration";
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

  const isFormValid = () => {
    return (
      formData.full_name &&
      formData.email &&
      formData.mobile_number &&
      formData.company_name &&
      formData.rera_license_number &&
      formData.specialization &&
      formData.years_of_experience
    );
  };

  const handleSendOtp = async () => {
    if (!isFormValid()) {
      toast.error("Please fill all required fields");
      return;
    }
    
    setOtpSending(true);
    try {
      await axios.post(`${API}/re-broker/send-otp`, {
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
      await axios.post(`${API}/re-broker/register`, {
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
              Thank you for registering with Kinntegraa. Our team will verify your RERA license and credentials. 
              You'll receive an email within <span className="font-semibold">48 working hours</span> with your login credentials once approved.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-left">
              <p className="text-sm text-amber-800">
                <strong>What's Next?</strong><br />
                1. RERA License Verification<br />
                2. Background Check<br />
                3. Account Activation<br />
                4. Welcome Email with Credentials
              </p>
            </div>
            <Button 
              onClick={() => navigate("/real-estate-brokers")}
              className="w-full"
              style={{ background: '#5B373C' }}
            >
              Back to Real Estate Brokers
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" 
         style={{ background: 'linear-gradient(135deg, #F5F5F0 0%, #E8E6E1 100%)' }}
         data-testid="re-broker-signup-page">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-6">
          <Link to="/real-estate-brokers" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Real Estate Brokers
          </Link>
          <h1 className="text-3xl font-bold" style={{ color: '#1F2937' }}>Real Estate Broker Registration</h1>
          <p className="text-gray-500 mt-2">Join Kinntegraa's network of Dubai RE professionals</p>
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
                    data-testid="re-broker-name-input"
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
                    data-testid="re-broker-email-input"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="mobile_number">Mobile Number *</Label>
                  <Input
                    id="mobile_number"
                    name="mobile_number"
                    value={formData.mobile_number}
                    onChange={handleChange}
                    placeholder="+971 XX XXX XXXX"
                    required
                    data-testid="re-broker-phone-input"
                  />
                </div>
              </div>
            </div>

            {/* Company Information */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Company & License Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company_name">Brokerage/Company Name *</Label>
                  <Input
                    id="company_name"
                    name="company_name"
                    value={formData.company_name}
                    onChange={handleChange}
                    placeholder="Your company name"
                    required
                    data-testid="re-broker-company-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rera_license_number">RERA License Number *</Label>
                  <Input
                    id="rera_license_number"
                    name="rera_license_number"
                    value={formData.rera_license_number}
                    onChange={handleChange}
                    placeholder="e.g., BRN-12345"
                    required
                    data-testid="re-broker-rera-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rera_expiry_date">RERA License Expiry</Label>
                  <Input
                    id="rera_expiry_date"
                    name="rera_expiry_date"
                    type="date"
                    value={formData.rera_expiry_date}
                    onChange={handleChange}
                    data-testid="re-broker-rera-expiry-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emirate">Primary Emirate *</Label>
                  <Select value={formData.emirate} onValueChange={(v) => handleSelectChange("emirate", v)}>
                    <SelectTrigger data-testid="re-broker-emirate-select">
                      <SelectValue placeholder="Select emirate" />
                    </SelectTrigger>
                    <SelectContent>
                      {UAE_EMIRATES.map(emirate => (
                        <SelectItem key={emirate} value={emirate}>{emirate}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="office_address">Office Address</Label>
                <Textarea
                  id="office_address"
                  name="office_address"
                  value={formData.office_address}
                  onChange={handleChange}
                  placeholder="Enter your office address"
                  rows={2}
                />
              </div>
            </div>

            {/* Professional Information */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide flex items-center gap-2">
                <Briefcase className="w-4 h-4" />
                Professional Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="specialization">Specialization *</Label>
                  <Select value={formData.specialization} onValueChange={(v) => handleSelectChange("specialization", v)}>
                    <SelectTrigger data-testid="re-broker-specialization-select">
                      <SelectValue placeholder="Select specialization" />
                    </SelectTrigger>
                    <SelectContent>
                      {SPECIALIZATIONS.map(spec => (
                        <SelectItem key={spec.value} value={spec.value}>{spec.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="years_of_experience">Years of Experience *</Label>
                  <Select value={formData.years_of_experience} onValueChange={(v) => handleSelectChange("years_of_experience", v)}>
                    <SelectTrigger data-testid="re-broker-experience-select">
                      <SelectValue placeholder="Select experience" />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPERIENCE_RANGES.map(exp => (
                        <SelectItem key={exp.value} value={exp.value}>{exp.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="team_size">Team Size</Label>
                  <Input
                    id="team_size"
                    name="team_size"
                    type="number"
                    min="1"
                    value={formData.team_size}
                    onChange={handleChange}
                    placeholder="Number of agents"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="primary_areas">Primary Areas of Operation</Label>
                <Input
                  id="primary_areas"
                  name="primary_areas"
                  value={formData.primary_areas}
                  onChange={handleChange}
                  placeholder="e.g., Dubai Marina, Palm Jumeirah, Downtown Dubai"
                />
              </div>
            </div>

            {/* Online Presence */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide flex items-center gap-2">
                <Globe className="w-4 h-4" />
                Online Presence (Optional)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    name="website"
                    value={formData.website}
                    onChange={handleChange}
                    placeholder="https://your-website.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="linkedin_profile">LinkedIn Profile</Label>
                  <Input
                    id="linkedin_profile"
                    name="linkedin_profile"
                    value={formData.linkedin_profile}
                    onChange={handleChange}
                    placeholder="https://linkedin.com/in/yourprofile"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="about">About Your Business</Label>
                <Textarea
                  id="about"
                  name="about"
                  value={formData.about}
                  onChange={handleChange}
                  placeholder="Tell us about your business, achievements, and what makes you stand out..."
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
                    data-testid="re-broker-otp-input"
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
                    data-testid="re-broker-submit-btn"
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
                  data-testid="re-broker-send-otp-btn"
                >
                  {otpSending ? "Sending OTP..." : "Continue"}
                </Button>

                {/* Note */}
                <p className="text-center text-xs text-gray-500">
                  By registering, you agree to our Terms of Service and Privacy Policy.
                  Your RERA license will be verified before account activation.
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
