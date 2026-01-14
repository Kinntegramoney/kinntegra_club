import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
      
      if (response.data.user.role === "broker") {
        navigate("/broker/dashboard");
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
    <div 
      className="min-h-screen flex items-center justify-center"
      style={{ 
        background: 'radial-gradient(circle at top right, rgba(255,255,255,0.08), rgba(0,0,0,0.15)), linear-gradient(135deg, #33222A, #2b1c23)'
      }}
      data-testid="login-page"
    >
      {/* Login Card */}
      <div 
        className="relative bg-white w-full max-w-md mx-4 overflow-hidden"
        style={{ 
          borderRadius: '14px',
          boxShadow: '0 25px 50px rgba(0,0,0,0.35)'
        }}
        data-testid="login-card"
      >
        {/* Header Strip with gradient */}
        <div 
          className="h-[90px] relative"
          style={{
            background: 'linear-gradient(135deg, #33222A 0%, #2b1c23 100%)'
          }}
        />
        
        {/* Logo - positioned to overlap header and body */}
        <div 
          className="absolute left-1/2 z-10"
          style={{
            transform: 'translateX(-50%)',
            top: '30px'
          }}
        >
          <img 
            src="/logo.png" 
            alt="Kinntegraa Club" 
            className="w-[120px] h-[120px] rounded-full"
            style={{
              border: 'none',
              outline: 'none',
              boxShadow: 'none'
            }}
          />
        </div>

        {/* Card Body */}
        <div className="pt-[70px] px-8 pb-8">
          {step === 1 ? (
            <form onSubmit={handleStep1Submit} data-testid="step1-form">
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label 
                    htmlFor="pan" 
                    className="text-sm font-medium"
                    style={{ color: '#545454' }}
                  >
                    PAN NO
                  </Label>
                  <Input
                    data-testid="pan-input"
                    id="pan"
                    type="text"
                    value={formData.pan}
                    onChange={(e) => setFormData({...formData, pan: e.target.value.toUpperCase()})}
                    maxLength={10}
                    className="h-11 font-mono text-base uppercase focus:border-[#875A31] focus:ring-[#875A31]/25"
                    style={{
                      borderColor: '#dee2e6',
                      borderRadius: '0.375rem'
                    }}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label 
                    htmlFor="password" 
                    className="text-sm font-medium"
                    style={{ color: '#545454' }}
                  >
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      data-testid="password-input"
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                      className="h-11 pr-12 text-base focus:border-[#875A31] focus:ring-[#875A31]/25"
                      style={{
                        borderColor: '#dee2e6',
                        borderRadius: '0.375rem'
                      }}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
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
                  className="w-full h-11 font-semibold text-sm mt-6 transition-colors"
                  style={{
                    background: '#875A31',
                    color: 'white',
                    borderRadius: '0.375rem'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = '#33222A';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = '#875A31';
                  }}
                >
                  {loading ? "SIGNING IN..." : "SIGN IN"}
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleStep2Submit} data-testid="step2-form">
              <div className="space-y-5">
                <div className="text-center mb-6">
                  <p className="text-sm" style={{ color: '#545454' }}>
                    Enter your 4-digit PIN to continue
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label 
                    htmlFor="pin" 
                    className="text-sm font-medium"
                    style={{ color: '#545454' }}
                  >
                    PIN
                  </Label>
                  <div className="relative">
                    <Input
                      data-testid="pin-input"
                      id="pin"
                      type={showPin ? "text" : "password"}
                      value={formData.pin}
                      onChange={(e) => setFormData({...formData, pin: e.target.value.replace(/\D/g, '').slice(0, 4)})}
                      maxLength={4}
                      className="h-11 pr-12 text-center text-xl tracking-[0.5em] font-mono focus:border-[#875A31] focus:ring-[#875A31]/25"
                      style={{
                        borderColor: '#dee2e6',
                        borderRadius: '0.375rem'
                      }}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      data-testid="toggle-pin"
                    >
                      {showPin ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <Button
                    type="button"
                    onClick={() => {
                      setStep(1);
                      setFormData({...formData, pin: ""});
                    }}
                    className="flex-1 h-11 font-semibold text-sm transition-colors"
                    style={{
                      background: 'transparent',
                      color: '#875A31',
                      border: '1px solid #875A31',
                      borderRadius: '0.375rem'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = '#f3f4f6';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    BACK
                  </Button>
                  <Button
                    data-testid="verify-button"
                    type="submit"
                    disabled={loading}
                    className="flex-1 h-11 font-semibold text-sm transition-colors"
                    style={{
                      background: '#875A31',
                      color: 'white',
                      borderRadius: '0.375rem'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = '#33222A';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = '#875A31';
                    }}
                  >
                    {loading ? "VERIFYING..." : "SIGN IN"}
                  </Button>
                </div>
              </div>
            </form>
          )}

          {/* Footer */}
          <div className="mt-8 text-center text-xs" style={{ color: '#D5CFC0' }}>
            <p>Kinntegraa L.L.C-FZ | License Number: 2418465.01</p>
            <p className="mt-1">Meydan Grandstand, 6th floor, Meydan Road,</p>
            <p>Nad Al Sheba, Dubai, U.A.E.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
