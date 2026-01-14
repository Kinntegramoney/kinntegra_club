import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { Eye, EyeOff, UserPlus, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function CustomerSignup() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    pan: "",
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    pin: "",
    confirmPin: ""
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.pan || !formData.name || !formData.email || !formData.phone || !formData.password || !formData.pin) {
      toast.error("Please fill in all fields");
      return;
    }

    if (formData.pan.length !== 10) {
      toast.error("PAN must be exactly 10 characters");
      return;
    }

    if (formData.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (formData.pin.length !== 4 || !/^\d+$/.test(formData.pin)) {
      toast.error("PIN must be exactly 4 digits");
      return;
    }

    if (formData.pin !== formData.confirmPin) {
      toast.error("PINs do not match");
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API}/auth/customer-signup`, {
        pan: formData.pan.toUpperCase(),
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
        pin: formData.pin
      });
      
      toast.success("Account created successfully! Please login.");
      navigate("/login");
    } catch (error) {
      console.error("Signup error:", error);
      toast.error(error.response?.data?.detail || "Failed to create account");
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

      {/* Signup Card */}
      <div className="w-full max-w-md mx-4 relative z-10">
        <div 
          className="bg-white rounded-2xl shadow-2xl p-8"
          style={{ 
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)'
          }}
          data-testid="signup-card"
        >
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div 
              className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold"
              style={{ background: '#D4A853' }}
            >
              K
            </div>
          </div>

          {/* Title */}
          <h1 className="text-xl font-semibold text-center mb-6" style={{ color: '#1F2937' }}>
            Create Your Account
          </h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* PAN */}
            <div className="space-y-1">
              <Label htmlFor="pan" className="text-xs font-medium tracking-wider"
                     style={{ color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                PAN Number
              </Label>
              <Input
                data-testid="signup-pan-input"
                id="pan"
                type="text"
                value={formData.pan}
                onChange={(e) => setFormData({...formData, pan: e.target.value.toUpperCase()})}
                maxLength={10}
                placeholder="ABCDE1234F"
                className="h-11 font-mono text-sm"
                style={{ borderColor: '#E5E7EB', borderRadius: '0.5rem' }}
                required
              />
            </div>

            {/* Name */}
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
                placeholder="John Doe"
                className="h-11 text-sm"
                style={{ borderColor: '#E5E7EB', borderRadius: '0.5rem' }}
                required
              />
            </div>

            {/* Email */}
            <div className="space-y-1">
              <Label htmlFor="email" className="text-xs font-medium tracking-wider"
                     style={{ color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Email
              </Label>
              <Input
                data-testid="signup-email-input"
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                placeholder="john@example.com"
                className="h-11 text-sm"
                style={{ borderColor: '#E5E7EB', borderRadius: '0.5rem' }}
                required
              />
            </div>

            {/* Phone */}
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
                placeholder="+91-9876543210"
                className="h-11 text-sm"
                style={{ borderColor: '#E5E7EB', borderRadius: '0.5rem' }}
                required
              />
            </div>

            {/* Password */}
            <div className="space-y-1">
              <Label htmlFor="password" className="text-xs font-medium tracking-wider"
                     style={{ color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Password
              </Label>
              <div className="relative">
                <Input
                  data-testid="signup-password-input"
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  placeholder="Min 6 characters"
                  className="h-11 pr-10 text-sm"
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

            {/* Confirm Password */}
            <div className="space-y-1">
              <Label htmlFor="confirmPassword" className="text-xs font-medium tracking-wider"
                     style={{ color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Confirm Password
              </Label>
              <Input
                data-testid="signup-confirm-password-input"
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                value={formData.confirmPassword}
                onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                placeholder="Re-enter password"
                className="h-11 text-sm"
                style={{ borderColor: '#E5E7EB', borderRadius: '0.5rem' }}
                required
              />
            </div>

            {/* PIN */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="pin" className="text-xs font-medium tracking-wider"
                       style={{ color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  4-Digit PIN
                </Label>
                <div className="relative">
                  <Input
                    data-testid="signup-pin-input"
                    id="pin"
                    type={showPin ? "text" : "password"}
                    value={formData.pin}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setFormData({...formData, pin: value});
                    }}
                    maxLength={4}
                    placeholder="****"
                    className="h-11 text-center font-mono text-sm"
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
              <div className="space-y-1">
                <Label htmlFor="confirmPin" className="text-xs font-medium tracking-wider"
                       style={{ color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Confirm PIN
                </Label>
                <Input
                  data-testid="signup-confirm-pin-input"
                  id="confirmPin"
                  type={showPin ? "text" : "password"}
                  value={formData.confirmPin}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setFormData({...formData, confirmPin: value});
                  }}
                  maxLength={4}
                  placeholder="****"
                  className="h-11 text-center font-mono text-sm"
                  style={{ borderColor: '#E5E7EB', borderRadius: '0.5rem' }}
                  required
                />
              </div>
            </div>

            <Button
              data-testid="signup-submit-button"
              type="submit"
              disabled={loading}
              className="w-full h-11 font-medium text-sm mt-4"
              style={{
                background: '#D4A853',
                color: 'white',
                borderRadius: '0.5rem',
                fontWeight: 500,
                letterSpacing: '0.05em'
              }}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  CREATING ACCOUNT...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  SIGN UP
                </span>
              )}
            </Button>
          </form>

          {/* Back to Login */}
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
