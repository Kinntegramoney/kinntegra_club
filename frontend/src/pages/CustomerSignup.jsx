import { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { UserPlus, CheckCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function CustomerSignup() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: ""
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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
      await axios.post(`${API}/leads/interest`, {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        source: "signup_page"
      });
      
      setSubmitted(true);
      toast.success("Thank you for your interest! We'll contact you soon.");
    } catch (error) {
      console.error("Signup error:", error);
      toast.error(error.response?.data?.detail || "Failed to submit. Please try again.");
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
            <div 
              className="w-14 h-14 rounded-full flex items-center justify-center overflow-hidden"
              style={{ 
                boxShadow: '0 6px 16px rgba(201, 162, 39, 0.3)'
              }}
            >
              <img 
                src="https://customer-assets.emergentagent.com/job_finance-portal-183/artifacts/pl00s3mu_image.png" 
                alt="Kinntegraa Logo" 
                className="w-full h-full object-cover scale-150"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
              <span className="text-white text-2xl font-bold hidden items-center justify-center w-full h-full rounded-full" style={{ fontFamily: 'serif', background: 'linear-gradient(135deg, #C9A227 0%, #A68521 100%)' }}>K</span>
            </div>
          </div>

          {submitted ? (
            /* Success State */
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">Thank You!</h2>
              <p className="text-gray-600 mb-6">
                Your interest has been registered. Our team will contact you shortly.
              </p>
              <Link
                to="/login"
                className="inline-block px-6 py-2 rounded-lg font-medium text-white"
                style={{ background: 'linear-gradient(135deg, #C9A227 0%, #A68521 100%)' }}
              >
                Back to Login
              </Link>
            </div>
          ) : (
            <>
              {/* Title */}
              <h1 className="text-xl font-semibold text-center mb-2" style={{ color: '#1F2937' }}>
                Get Started
              </h1>
              <p className="text-sm text-gray-500 text-center mb-6">
                Register your interest and our team will reach out to you
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Full Name */}
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

                {/* Email */}
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
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      SUBMITTING...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <UserPlus className="h-4 w-4" />
                      REGISTER INTEREST
                    </span>
                  )}
                </Button>
              </form>

              {/* Back to Login */}
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
