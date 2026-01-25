import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Login() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: PAN+Password, 2: PIN
  const [formData, setFormData] = useState({
    pan: "",
    password: "",
    pin: ""
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tempToken, setTempToken] = useState("");

  // Set page title
  useEffect(() => {
    document.title = "Kinntegraa | Login";
  }, []);

  const handleStep1Submit = async (e) => {
    e.preventDefault();
    
    if (!formData.pan || !formData.password) {
      toast.error("Please enter PAN and Password");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API}/auth/login-step1`, {
        pan: formData.pan.toUpperCase(),
        password: formData.password
      });
      
      setTempToken(response.data.temp_token);
      setStep(2);
      toast.success("Please enter your PIN");
    } catch (error) {
      console.error("Login error:", error);
      toast.error(error.response?.data?.detail || "Invalid PAN or Password");
    } finally {
      setLoading(false);
    }
  };

  const handleStep2Submit = async (e) => {
    e.preventDefault();
    
    if (!formData.pin || formData.pin.length !== 4) {
      toast.error("Please enter 4-digit PIN");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API}/auth/login-step2`, {
        temp_token: tempToken,
        pin: formData.pin
      });
      
      localStorage.setItem("token", response.data.token);
      localStorage.setItem("user", JSON.stringify(response.data.user));
      
      toast.success(`Welcome, ${response.data.user.name}!`);
      
      // Redirect based on role - always go to opportunities as dashboard may be disabled
      if (response.data.user.role === "broker") {
        navigate("/broker/opportunities");
      } else if (response.data.user.role === "client") {
        navigate("/client/opportunities");
      } else {
        navigate("/sub-broker/opportunities");
      }
    } catch (error) {
      console.error("PIN error:", error);
      toast.error(error.response?.data?.detail || "Invalid PIN");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
         style={{ 
           background: 'linear-gradient(135deg, #5B373C 0%, #3D252A 50%, #1F1F1F 100%)',
           position: 'relative'
         }}>
      
      {/* Abstract background shapes - Etihad theme */}
      <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.1 }}>
        <defs>
          <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#C9A227', stopOpacity: 0.4 }} />
            <stop offset="100%" style={{ stopColor: '#A68521', stopOpacity: 0.3 }} />
          </linearGradient>
        </defs>
        <path d="M 0,400 Q 400,200 800,400 T 1600,400 L 1600,0 L 0,0 Z" fill="url(#grad1)" />
        <ellipse cx="20%" cy="60%" rx="400" ry="300" fill="url(#grad1)" opacity="0.3" />
        <ellipse cx="80%" cy="30%" rx="350" ry="250" fill="url(#grad1)" opacity="0.3" />
      </svg>

      {/* Login Card */}
      <div className="relative z-10 bg-white rounded-xl shadow-2xl w-full max-w-md mx-4"
           style={{ 
             padding: '3rem 2.5rem',
             boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
           }}
           data-testid="login-card">
        
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <div className="relative">
            <div className="w-20 h-20 rounded-full flex items-center justify-center"
                 style={{
                   background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                   boxShadow: '0 10px 25px rgba(245, 158, 11, 0.3)'
                 }}>
              <span className="text-white text-4xl font-bold" style={{ fontFamily: 'serif' }}>K</span>
            </div>
          </div>
        </div>

        {step === 1 ? (
          <form onSubmit={handleStep1Submit} data-testid="step1-form">
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="pan" 
                       className="text-xs font-medium tracking-wider"
                       style={{ color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  PAN NO
                </Label>
                <Input
                  data-testid="pan-input"
                  id="pan"
                  type="text"
                  value={formData.pan}
                  onChange={(e) => setFormData({...formData, pan: e.target.value.toUpperCase()})}
                  maxLength={10}
                  className="h-12 font-mono text-base"
                  style={{
                    borderColor: '#E5E7EB',
                    borderRadius: '0.5rem',
                    fontSize: '15px'
                  }}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" 
                       className="text-xs font-medium tracking-wider"
                       style={{ color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Password
                </Label>
                <div className="relative">
                  <Input
                    data-testid="password-input"
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    className="h-12 pr-12 text-base"
                    style={{
                      borderColor: '#E5E7EB',
                      borderRadius: '0.5rem',
                      fontSize: '15px'
                    }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2"
                    style={{ color: '#9CA3AF' }}
                    data-testid="toggle-password"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <Button
                data-testid="next-button"
                type="submit"
                disabled={loading}
                className="w-full h-12 font-medium text-base"
                style={{
                  background: '#78716C',
                  color: 'white',
                  borderRadius: '0.5rem',
                  marginTop: '2rem',
                  fontWeight: 500,
                  letterSpacing: '0.05em'
                }}
              >
                {loading ? "VERIFYING..." : "SIGN IN"}
              </Button>

              <div className="text-center mt-4">
                <Link
                  to="/forgot-password"
                  className="text-sm hover:underline"
                  style={{ color: '#9CA3AF' }}
                  data-testid="forgot-password-link"
                >
                  Forgot Password?
                </Link>
              </div>

              {/* Signup Link */}
              <div className="text-center mt-4 pt-4 border-t" style={{ borderColor: '#E5E7EB' }}>
                <p className="text-sm" style={{ color: '#6B7280' }}>
                  Don&apos;t have an account?{" "}
                  <Link
                    to="/signup"
                    className="font-medium hover:underline"
                    style={{ color: '#D4A853' }}
                    data-testid="signup-link"
                  >
                    Sign Up
                  </Link>
                </p>
              </div>
            </div>
          </form>
        ) : (
          <form onSubmit={handleStep2Submit} data-testid="step2-form">
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="pin" 
                       className="text-xs font-medium tracking-wider"
                       style={{ color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  PIN
                </Label>
                <div className="relative">
                  <Input
                    data-testid="pin-input"
                    id="pin"
                    type={showPin ? "text" : "password"}
                    value={formData.pin}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setFormData({...formData, pin: value});
                    }}
                    maxLength={4}
                    className="h-12 pr-12 font-mono text-center text-xl tracking-widest"
                    style={{
                      borderColor: '#E5E7EB',
                      borderRadius: '0.5rem'
                    }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-4 top-1/2 -translate-y-1/2"
                    style={{ color: '#9CA3AF' }}
                    data-testid="toggle-pin"
                  >
                    {showPin ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <Button
                data-testid="signin-button"
                type="submit"
                disabled={loading || formData.pin.length !== 4}
                className="w-full h-12 font-medium text-base"
                style={{
                  background: '#78716C',
                  color: 'white',
                  borderRadius: '0.5rem',
                  marginTop: '2rem',
                  fontWeight: 500,
                  letterSpacing: '0.05em'
                }}
              >
                {loading ? "SIGNING IN..." : "SIGN IN"}
              </Button>

              <div className="text-center mt-4">
                <Link
                  to="/forgot-password"
                  className="text-sm hover:underline"
                  style={{ color: '#9CA3AF' }}
                  data-testid="forgot-pin-link"
                >
                  Forgot PIN?
                </Link>
              </div>

              <div className="text-center mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setFormData({...formData, pin: ""});
                    setTempToken("");
                  }}
                  className="text-sm hover:underline"
                  style={{ color: '#3B82F6' }}
                >
                  ← Back to login
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Footer */}
        <div className="mt-10 pt-8 border-t text-center"
             style={{ 
               borderColor: '#E5E7EB',
               fontSize: '11px',
               lineHeight: '1.6',
               color: '#6B7280'
             }}>
          <p className="font-semibold" style={{ color: '#374151' }}>Kinntegraa L.L.C-FZ</p>
          <p className="mt-1">License No: 2418465.01</p>
          <p className="mt-1">Meydan Grandstand, 6th floor, Meydan Road,<br />Nad Al Sheba, Dubai, U.A.E.</p>
        </div>
      </div>
    </div>
  );
}