import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { UserPlus, CheckCircle, ArrowLeft, Mail, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function CustomerSignup() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: form, 2: OTP verification, 3: success
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: ""
  });
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const otpRefs = useRef([]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.name || !formData.email || !formData.phone) {
      toast.error("Please fill in all fields");
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast.error("Please enter a valid email address");
      return;
    }

    // Phone validation (at least 10 digits)
    const phoneDigits = formData.phone.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      toast.error("Please enter a valid phone number");
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API}/auth/send-otp`, {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim()
      });
      
      setStep(2);
      setCountdown(60); // 60 seconds before resend
      toast.success("OTP sent to your email!");
    } catch (error) {
      console.error("Send OTP error:", error);
      toast.error(error.response?.data?.detail || "Failed to send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index, value) => {
    if (value.length > 1) {
      value = value[value.length - 1];
    }
    
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 6);
    if (/^\d+$/.test(pastedData)) {
      const newOtp = [...otp];
      pastedData.split('').forEach((char, index) => {
        if (index < 6) newOtp[index] = char;
      });
      setOtp(newOtp);
      if (pastedData.length === 6) {
        otpRefs.current[5]?.focus();
      }
    }
  };

  const handleVerifyOtp = async () => {
    const otpString = otp.join('');
    if (otpString.length !== 6) {
      toast.error("Please enter the complete 6-digit OTP");
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API}/auth/verify-otp`, {
        email: formData.email.trim().toLowerCase(),
        otp: otpString,
        name: formData.name.trim(),
        phone: formData.phone.trim()
      });
      
      setStep(3);
      toast.success("Email verified successfully!");
    } catch (error) {
      console.error("Verify OTP error:", error);
      toast.error(error.response?.data?.detail || "Invalid OTP. Please try again.");
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;
    
    setResending(true);
    try {
      await axios.post(`${API}/auth/resend-otp`, {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim()
      });
      
      setCountdown(60);
      setOtp(['', '', '', '', '', '']);
      toast.success("New OTP sent to your email!");
    } catch (error) {
      console.error("Resend OTP error:", error);
      toast.error(error.response?.data?.detail || "Failed to resend OTP.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
         style={{ 
           background: 'linear-gradient(135deg, #5B373C 0%, #3D252A 50%, #1F1F1F 100%)',
           position: 'relative'
         }}>
      
      {/* Abstract background shapes */}
      <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.1 }}>
        <defs>
          <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#C9A227', stopOpacity: 0.4 }} />
            <stop offset="100%" style={{ stopColor: '#A68521', stopOpacity: 0.3 }} />
          </linearGradient>
        </defs>
        <ellipse cx="20%" cy="30%" rx="300" ry="300" fill="url(#grad1)" />
        <ellipse cx="80%" cy="70%" rx="400" ry="400" fill="url(#grad1)" />
        <ellipse cx="60%" cy="20%" rx="200" ry="200" fill="url(#grad1)" />
      </svg>

      {/* Signup Card */}
      <div className="w-full max-w-sm mx-4 relative z-10">
        <div 
          className="bg-white rounded-2xl shadow-2xl p-6"
          style={{ 
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)'
          }}
          data-testid="signup-card"
        >
          {/* Logo */}
          <div className="flex justify-center mb-5">
            <img 
              src="/logo.svg" 
              alt="Kinntegraa Logo" 
              className="w-14 h-14"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
            <span className="text-white text-2xl font-bold hidden items-center justify-center w-14 h-14 rounded-full" style={{ fontFamily: 'serif', background: 'linear-gradient(135deg, #C9A227 0%, #A68521 100%)' }}>K</span>
          </div>

          {/* Step 1: Form */}
          {step === 1 && (
            <>
              <h1 className="text-xl font-semibold text-center mb-2" style={{ color: '#1F2937' }}>
                Get Started
              </h1>
              <p className="text-sm text-gray-500 text-center mb-6">
                Enter your details to access investment opportunities
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="name" className="text-xs font-medium tracking-wider"
                         style={{ color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Full Name
                  </Label>
                  <Input
                    data-testid="signup-name-input"
                    id="name"
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="Enter your full name"
                    className="h-11 text-sm"
                    style={{ borderColor: '#E5E7EB', borderRadius: '0.5rem' }}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="email" className="text-xs font-medium tracking-wider"
                         style={{ color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Email Address
                  </Label>
                  <Input
                    data-testid="signup-email-input"
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    placeholder="you@example.com"
                    className="h-11 text-sm"
                    style={{ borderColor: '#E5E7EB', borderRadius: '0.5rem' }}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="phone" className="text-xs font-medium tracking-wider"
                         style={{ color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Phone Number
                  </Label>
                  <Input
                    data-testid="signup-phone-input"
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    placeholder="+91 9876543210"
                    className="h-11 text-sm"
                    style={{ borderColor: '#E5E7EB', borderRadius: '0.5rem' }}
                    required
                  />
                </div>

                <Button
                  data-testid="signup-submit-button"
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 font-medium text-sm mt-4"
                  style={{
                    background: 'linear-gradient(135deg, #C9A227 0%, #A68521 100%)',
                    color: 'white',
                    borderRadius: '0.5rem',
                    fontWeight: 500,
                    letterSpacing: '0.05em'
                  }}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      SENDING OTP...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Mail className="h-4 w-4" />
                      VERIFY EMAIL
                    </span>
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <Link 
                  to="/login"
                  className="text-sm flex items-center justify-center gap-1 hover:underline"
                  style={{ color: '#C9A227' }}
                  data-testid="back-to-login-link"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Login
                </Link>
              </div>
            </>
          )}

          {/* Step 2: OTP Verification */}
          {step === 2 && (
            <>
              <h1 className="text-xl font-semibold text-center mb-2" style={{ color: '#1F2937' }}>
                Verify Your Email
              </h1>
              <p className="text-sm text-gray-500 text-center mb-2">
                We've sent a 6-digit code to
              </p>
              <p className="text-sm font-medium text-center mb-6" style={{ color: '#5B373C' }}>
                {formData.email}
              </p>

              <div className="flex justify-center gap-2 mb-6">
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => (otpRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    onPaste={index === 0 ? handleOtpPaste : undefined}
                    className="w-11 h-12 text-center text-xl font-bold border-2 rounded-lg focus:outline-none focus:border-yellow-600 transition-colors"
                    style={{ 
                      borderColor: digit ? '#C9A227' : '#E5E7EB',
                      color: '#1F2937'
                    }}
                    data-testid={`otp-input-${index}`}
                  />
                ))}
              </div>

              <Button
                onClick={handleVerifyOtp}
                disabled={loading || otp.join('').length !== 6}
                className="w-full h-11 font-medium text-sm"
                style={{
                  background: otp.join('').length === 6 
                    ? 'linear-gradient(135deg, #C9A227 0%, #A68521 100%)'
                    : '#E5E7EB',
                  color: otp.join('').length === 6 ? 'white' : '#9CA3AF',
                  borderRadius: '0.5rem',
                  fontWeight: 500
                }}
                data-testid="verify-otp-button"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    VERIFYING...
                  </span>
                ) : (
                  'VERIFY OTP'
                )}
              </Button>

              <div className="mt-4 text-center">
                {countdown > 0 ? (
                  <p className="text-sm text-gray-500">
                    Resend OTP in <span className="font-semibold">{countdown}s</span>
                  </p>
                ) : (
                  <button
                    onClick={handleResendOtp}
                    disabled={resending}
                    className="text-sm font-medium flex items-center justify-center gap-1 mx-auto hover:underline"
                    style={{ color: '#C9A227' }}
                    data-testid="resend-otp-button"
                  >
                    {resending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Resend OTP
                  </button>
                )}
              </div>

              <div className="mt-4 text-center">
                <button
                  onClick={() => setStep(1)}
                  className="text-sm flex items-center justify-center gap-1 mx-auto hover:underline"
                  style={{ color: '#6B7280' }}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Change Email
                </button>
              </div>
            </>
          )}

          {/* Step 3: Success */}
          {step === 3 && (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">Email Verified!</h2>
              <p className="text-gray-600 mb-6">
                Thank you for verifying your email. Our team will contact you shortly with investment details.
              </p>
              <Link
                to="/"
                className="inline-block px-6 py-3 rounded-lg font-medium text-white"
                style={{ background: 'linear-gradient(135deg, #C9A227 0%, #A68521 100%)' }}
                data-testid="back-to-home-link"
              >
                Explore Opportunities
              </Link>
              <div className="mt-4">
                <Link
                  to="/login"
                  className="text-sm hover:underline"
                  style={{ color: '#5B373C' }}
                >
                  Already have an account? Login
                </Link>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="mt-6 pt-4 border-t text-center" style={{ borderColor: '#E5E7EB' }}>
            <p className="text-xs font-medium" style={{ color: '#6B7280' }}>Kinntegraa LLC-FZ</p>
            <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>License No: 2418465.01</p>
            <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>
              Meydan Grandstand, 6th floor, Meydan Road,<br />
              Nad Al Sheba, Dubai, U.A.E.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
