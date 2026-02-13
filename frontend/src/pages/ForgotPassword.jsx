import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import { Eye, EyeOff, ArrowLeft, Mail, KeyRound, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resetToken = searchParams.get("token");
  
  // Step: 1 = Request reset, 2 = Reset form (if token present), 3 = Success
  const [step, setStep] = useState(resetToken ? 2 : 1);
  
  const [formData, setFormData] = useState({
    pan: "",
    email: "",
    newPassword: "",
    confirmPassword: "",
    newPin: "",
    confirmPin: ""
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);

  // Step 1: Request password reset
  const handleRequestReset = async (e) => {
    e.preventDefault();
    
    if (!formData.pan || !formData.email) {
      toast.error("Please enter PAN and Email");
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API}/auth/forgot-password`, {
        pan: formData.pan.toUpperCase(),
        email: formData.email
      });
      
      toast.success("If your details match, you will receive a reset link via email");
      setStep(3);
    } catch (error) {
      console.error("Reset request error:", error);
      toast.error(error.response?.data?.detail || "Failed to process request");
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Reset password with token
  const handleResetPassword = async (e) => {
    e.preventDefault();
    
    if (!formData.newPassword || !formData.newPin) {
      toast.error("Please fill in all fields");
      return;
    }

    if (formData.newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (formData.newPin.length !== 4 || !/^\d+$/.test(formData.newPin)) {
      toast.error("PIN must be exactly 4 digits");
      return;
    }

    if (formData.newPin !== formData.confirmPin) {
      toast.error("PINs do not match");
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API}/auth/reset-password`, {
        reset_token: resetToken,
        new_password: formData.newPassword,
        new_pin: formData.newPin
      });
      
      toast.success("Password and PIN reset successfully!");
      setStep(3);
    } catch (error) {
      console.error("Reset error:", error);
      toast.error(error.response?.data?.detail || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
         style={{ 
           background: '#2B1B3D',
           position: 'relative'
         }}>
      
      {/* Abstract background shapes */}
      <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.08 }}>
        <defs>
          <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#f59e0b', stopOpacity: 0.3 }} />
            <stop offset="100%" style={{ stopColor: '#8b5cf6', stopOpacity: 0.3 }} />
          </linearGradient>
        </defs>
        <ellipse cx="20%" cy="30%" rx="300" ry="300" fill="url(#grad1)" />
        <ellipse cx="80%" cy="70%" rx="400" ry="400" fill="url(#grad1)" />
        <ellipse cx="60%" cy="20%" rx="200" ry="200" fill="url(#grad1)" />
      </svg>

      {/* Card */}
      <div className="w-full max-w-md mx-4 relative z-10">
        <div 
          className="bg-white rounded-2xl shadow-2xl p-8"
          style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)' }}
          data-testid="forgot-password-card"
        >
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div 
              className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden"
              style={{ boxShadow: '0 8px 20px rgba(201, 162, 39, 0.3)' }}
            >
              <img 
                src="/logo.png" 
                alt="Kinntegraa Logo" 
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
              <span className="text-white text-2xl font-bold hidden items-center justify-center w-full h-full rounded-full" style={{ background: '#D4A853' }}>K</span>
            </div>
          </div>

          {/* Step 1: Request Reset */}
          {step === 1 && (
            <>
              <h1 className="text-xl font-semibold text-center mb-2" style={{ color: '#1F2937' }}>
                Forgot Password?
              </h1>
              <p className="text-sm text-center mb-6" style={{ color: '#6B7280' }}>
                Enter your PAN and email to receive a reset link
              </p>

              <form onSubmit={handleRequestReset} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pan" className="text-xs font-medium tracking-wider"
                         style={{ color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    PAN Number
                  </Label>
                  <Input
                    data-testid="forgot-pan-input"
                    id="pan"
                    type="text"
                    value={formData.pan}
                    onChange={(e) => setFormData({...formData, pan: e.target.value.toUpperCase()})}
                    maxLength={10}
                    placeholder="ABCDE1234F"
                    className="h-12 font-mono"
                    style={{ borderColor: '#E5E7EB', borderRadius: '0.5rem' }}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs font-medium tracking-wider"
                         style={{ color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Registered Email
                  </Label>
                  <Input
                    data-testid="forgot-email-input"
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    placeholder="your@email.com"
                    className="h-12"
                    style={{ borderColor: '#E5E7EB', borderRadius: '0.5rem' }}
                    required
                  />
                </div>

                <Button
                  data-testid="send-reset-button"
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 font-medium"
                  style={{
                    background: '#D4A853',
                    color: 'white',
                    borderRadius: '0.5rem',
                    marginTop: '1.5rem'
                  }}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      SENDING...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Mail className="h-4 w-4" />
                      SEND RESET LINK
                    </span>
                  )}
                </Button>
              </form>
            </>
          )}

          {/* Step 2: Reset Password Form */}
          {step === 2 && (
            <>
              <h1 className="text-xl font-semibold text-center mb-2" style={{ color: '#1F2937' }}>
                Reset Credentials
              </h1>
              <p className="text-sm text-center mb-6" style={{ color: '#6B7280' }}>
                Enter your new password and PIN
              </p>

              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword" className="text-xs font-medium tracking-wider"
                         style={{ color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    New Password
                  </Label>
                  <div className="relative">
                    <Input
                      data-testid="new-password-input"
                      id="newPassword"
                      type={showPassword ? "text" : "password"}
                      value={formData.newPassword}
                      onChange={(e) => setFormData({...formData, newPassword: e.target.value})}
                      placeholder="Min 6 characters"
                      className="h-12 pr-10"
                      style={{ borderColor: '#E5E7EB', borderRadius: '0.5rem' }}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: '#9CA3AF' }}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-xs font-medium tracking-wider"
                         style={{ color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Confirm Password
                  </Label>
                  <Input
                    data-testid="confirm-password-input"
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                    placeholder="Re-enter password"
                    className="h-12"
                    style={{ borderColor: '#E5E7EB', borderRadius: '0.5rem' }}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="newPin" className="text-xs font-medium tracking-wider"
                           style={{ color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      New PIN
                    </Label>
                    <div className="relative">
                      <Input
                        data-testid="new-pin-input"
                        id="newPin"
                        type={showPin ? "text" : "password"}
                        value={formData.newPin}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                          setFormData({...formData, newPin: value});
                        }}
                        maxLength={4}
                        placeholder="****"
                        className="h-12 text-center font-mono"
                        style={{ borderColor: '#E5E7EB', borderRadius: '0.5rem' }}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPin(!showPin)}
                        className="absolute right-2 top-1/2 -translate-y-1/2"
                        style={{ color: '#9CA3AF' }}
                      >
                        {showPin ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPin" className="text-xs font-medium tracking-wider"
                           style={{ color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Confirm PIN
                    </Label>
                    <Input
                      data-testid="confirm-pin-input"
                      id="confirmPin"
                      type={showPin ? "text" : "password"}
                      value={formData.confirmPin}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                        setFormData({...formData, confirmPin: value});
                      }}
                      maxLength={4}
                      placeholder="****"
                      className="h-12 text-center font-mono"
                      style={{ borderColor: '#E5E7EB', borderRadius: '0.5rem' }}
                      required
                    />
                  </div>
                </div>

                <Button
                  data-testid="reset-password-button"
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 font-medium"
                  style={{
                    background: '#D4A853',
                    color: 'white',
                    borderRadius: '0.5rem',
                    marginTop: '1.5rem'
                  }}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      RESETTING...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <KeyRound className="h-4 w-4" />
                      RESET CREDENTIALS
                    </span>
                  )}
                </Button>
              </form>
            </>
          )}

          {/* Step 3: Success */}
          {step === 3 && (
            <div className="text-center py-6">
              <CheckCircle className="h-16 w-16 mx-auto mb-4" style={{ color: '#22C55E' }} />
              <h1 className="text-xl font-semibold mb-2" style={{ color: '#1F2937' }}>
                {resetToken ? "Credentials Reset!" : "Check Your Email"}
              </h1>
              <p className="text-sm mb-6" style={{ color: '#6B7280' }}>
                {resetToken 
                  ? "Your password and PIN have been reset successfully. You can now login with your new credentials."
                  : "If your PAN and email match our records, you will receive a password reset link shortly."
                }
              </p>
              <Button
                onClick={() => navigate("/login")}
                className="h-12 px-8 font-medium"
                style={{
                  background: '#D4A853',
                  color: 'white',
                  borderRadius: '0.5rem'
                }}
                data-testid="go-to-login-button"
              >
                GO TO LOGIN
              </Button>
            </div>
          )}

          {/* Back to Login */}
          {step !== 3 && (
            <div className="mt-6 text-center">
              <Link 
                to="/login"
                className="text-sm flex items-center justify-center gap-1 hover:underline"
                style={{ color: '#D4A853' }}
                data-testid="back-to-login-link"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Login
              </Link>
            </div>
          )}

          {/* Footer */}
          <div className="mt-6 pt-4 border-t text-center" style={{ borderColor: '#E5E7EB' }}>
            <p className="text-xs font-medium" style={{ color: '#6B7280' }}>Kinntegraa LLC-FZ</p>
            <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>License No: 1922240.01</p>
          </div>
        </div>
      </div>
    </div>
  );
}
