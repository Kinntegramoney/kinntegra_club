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
      
      // Store auth token and user info
      localStorage.setItem("token", response.data.token);
      localStorage.setItem("user", JSON.stringify(response.data.user));
      
      toast.success(`Welcome, ${response.data.user.name}!`);
      
      // Navigate based on role
      if (response.data.user.role === "broker") {
        navigate("/broker/dashboard");
      } else {
        navigate("/sub-broker/dashboard");
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
         style={{ background: "linear-gradient(135deg, #2d1b4e 0%, #1a1126 100%)" }}>
      
      {/* Abstract background patterns */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-20 w-96 h-96 rounded-full"
             style={{ background: "radial-gradient(circle, #f59e0b 0%, transparent 70%)" }}></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full"
             style={{ background: "radial-gradient(circle, #8b5cf6 0%, transparent 70%)" }}></div>
      </div>

      {/* Login Card */}
      <div className="relative z-10 bg-white rounded-lg shadow-2xl p-8 w-full max-w-md mx-4"
           data-testid="login-card">
        
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg">
            <span className="text-white text-3xl font-bold">K</span>
          </div>
        </div>

        {step === 1 ? (
          <form onSubmit={handleStep1Submit} data-testid="step1-form">
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="pan" className="text-gray-600 text-sm font-medium uppercase">PAN NO</Label>
                <Input
                  data-testid="pan-input"
                  id="pan"
                  type="text"
                  value={formData.pan}
                  onChange={(e) => setFormData({...formData, pan: e.target.value.toUpperCase()})}
                  placeholder="Enter your PAN Number"
                  maxLength={10}
                  className="h-12 font-mono"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-gray-600 text-sm font-medium uppercase">Password</Label>
                <div className="relative">
                  <Input
                    data-testid="password-input"
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    placeholder="Enter your Password"
                    className="h-12 pr-10"
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
                className="w-full h-12 bg-gradient-to-r from-amber-700 to-orange-700 hover:from-amber-800 hover:to-orange-800 text-white font-medium text-base"
              >
                {loading ? "Verifying..." : "NEXT"}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  className="text-sm text-gray-500 hover:text-gray-700"
                  onClick={() => toast.info("Please contact administrator")}
                >
                  Forgot Password?
                </button>
              </div>
            </div>
          </form>
        ) : (
          <form onSubmit={handleStep2Submit} data-testid="step2-form">
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="pin" className="text-gray-600 text-sm font-medium uppercase">PIN</Label>
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
                    placeholder="Enter 4-digit PIN"
                    maxLength={4}
                    className="h-12 pr-10 font-mono text-center text-2xl tracking-widest"
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

              <Button
                data-testid="signin-button"
                type="submit"
                disabled={loading || formData.pin.length !== 4}
                className="w-full h-12 bg-gradient-to-r from-amber-700 to-orange-700 hover:from-amber-800 hover:to-orange-800 text-white font-medium text-base"
              >
                {loading ? "Signing In..." : "SIGN IN"}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  className="text-sm text-gray-500 hover:text-gray-700"
                  onClick={() => toast.info("Please contact administrator")}
                >
                  Forgot PIN?
                </button>
              </div>

              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setFormData({...formData, pin: ""});
                    setTempToken("");
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  ← Back to login
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-gray-200 text-center text-xs text-gray-500">
          <p className="font-medium">Kinntegraa LLC-FZ</p>
          <p className="mt-1">License No: 1922240.01</p>
          <p className="mt-1">Business Center, Sharjah Publishing City Free Zone, Sharjah, UAE</p>
        </div>
      </div>
    </div>
  );
}