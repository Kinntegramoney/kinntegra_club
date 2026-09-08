import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const SetupPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [error, setError] = useState('');
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    document.title = "Kinntegraa | Set Up Your Account";
    verifyToken();
  }, [token]);

  const verifyToken = async () => {
    if (!token) {
      setError('No setup token provided');
      setVerifying(false);
      return;
    }

    try {
      const response = await fetch(`${API}/api/auth/verify-setup-token/${token}`);
      const data = await response.json();
      
      if (response.ok && data.valid) {
        setTokenValid(true);
        setUserInfo(data);
      } else {
        setError(data.detail || 'Invalid or expired setup link');
      }
    } catch (err) {
      setError('Unable to verify setup link. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (pin.length !== 4 || !/^\d+$/.test(pin)) {
      toast.error('PIN must be exactly 4 digits');
      return;
    }
    if (pin !== confirmPin) {
      toast.error('PINs do not match');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API}/api/auth/setup-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          new_password: password,
          new_pin: pin
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSuccess(true);
        toast.success('Account setup complete!');
      } else {
        toast.error(data.detail || 'Failed to set up account');
      }
    } catch (err) {
      toast.error('Error setting up account. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (verifying) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-[#8B7355]" />
          <p className="mt-4 text-gray-600">Verifying setup link...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Setup Link Invalid</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <Button onClick={() => navigate('/login')} className="bg-[#8B7355] hover:bg-[#7a6349]">
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Account Setup Complete!</h2>
          <p className="text-gray-600 mb-4">Your password and PIN have been set successfully.</p>
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-600">Your Login ID:</p>
            <p className="text-lg font-mono font-bold text-gray-800">{userInfo?.login_id}</p>
            <p className="text-xs text-gray-500 mt-1">(Your PAN Number)</p>
          </div>
          <Button onClick={() => navigate('/login')} className="w-full bg-[#8B7355] hover:bg-[#7a6349]">
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  // Setup form
  return (
    <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-6">
          <Lock className="h-12 w-12 text-[#8B7355] mx-auto mb-3" />
          <h1 className="text-2xl font-semibold text-gray-800">Set Up Your Account</h1>
          <p className="text-gray-600 mt-2">Welcome, {userInfo?.name}!</p>
        </div>

        {/* User ID Info */}
        <div className="bg-blue-50 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-800 font-medium">Your User ID</p>
          <p className="text-xl font-mono font-bold text-blue-900">{userInfo?.login_id}</p>
          <p className="text-xs text-blue-700 mt-1">This is your PAN number. Use this to login.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Password */}
          <div>
            <Label className="text-sm text-gray-700 mb-1.5 block">Create Password *</Label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter password (min 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <Label className="text-sm text-gray-700 mb-1.5 block">Confirm Password *</Label>
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            {confirmPassword && password !== confirmPassword && (
              <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
            )}
          </div>

          {/* PIN */}
          <div>
            <Label className="text-sm text-gray-700 mb-1.5 block">Create 4-Digit PIN *</Label>
            <div className="relative">
              <Input
                type={showPin ? 'text' : 'password'}
                placeholder="Enter 4-digit PIN"
                value={pin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setPin(val);
                }}
                maxLength={4}
                className="pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Confirm PIN */}
          <div>
            <Label className="text-sm text-gray-700 mb-1.5 block">Confirm PIN *</Label>
            <Input
              type={showPin ? 'text' : 'password'}
              placeholder="Confirm your PIN"
              value={confirmPin}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                setConfirmPin(val);
              }}
              maxLength={4}
              required
            />
            {confirmPin && pin !== confirmPin && (
              <p className="text-xs text-red-500 mt-1">PINs do not match</p>
            )}
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#8B7355] hover:bg-[#7a6349] py-3"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Setting up...</>
            ) : (
              'Complete Setup'
            )}
          </Button>
        </form>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-gray-500">
          <p>Kinntegraa L.L.C-FZ</p>
          <p>License No: 2418465.01</p>
        </div>
      </div>
    </div>
  );
};

export default SetupPassword;
