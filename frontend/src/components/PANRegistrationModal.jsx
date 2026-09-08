import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, User, Mail, Phone, Globe, ArrowLeft } from "lucide-react";

const COUNTRIES = [
  "India", "United Arab Emirates", "United States", "United Kingdom", "Singapore",
  "Canada", "Australia", "Germany", "Oman", "Qatar", "Saudi Arabia", "Bahrain", "Kuwait",
  "France", "Japan", "Hong Kong", "Malaysia", "Thailand", "Indonesia", "New Zealand"
];

const PANRegistrationModal = ({ isOpen, onClose, panData, onSave, sessionId }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    mobile: '',
    country_of_residency: 'India',
    passport_type: 'indian'
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (panData) {
      setFormData({
        name: panData.name || '',
        email: panData.email || '',
        mobile: panData.mobile || '',
        country_of_residency: panData.country_of_residency || 'India',
        passport_type: panData.passport_type || 'indian'
      });
    }
  }, [panData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      alert('Full Name is required');
      return;
    }

    setSaving(true);
    try {
      await onSave(panData.pan, formData);
      onClose();
    } catch (error) {
      console.error('Error saving:', error);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-[#f5f5f0] rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-4 text-center border-b border-gray-200">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
          <button
            onClick={onClose}
            className="text-sm text-gray-600 hover:text-gray-800 flex items-center justify-center gap-1 mx-auto mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to CAS Analysis
          </button>
          <h2 className="text-2xl font-semibold text-gray-800">Private Investor Registration</h2>
          <p className="text-sm text-gray-500 mt-1">PAN: <span className="font-mono font-semibold">{panData?.pan}</span></p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Full Name */}
          <div>
            <Label className="text-sm text-gray-700 mb-1.5 block">Full Name *</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Enter your full name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="pl-10 bg-white border-gray-300"
                required
              />
            </div>
          </div>

          {/* Email Address */}
          <div>
            <Label className="text-sm text-gray-700 mb-1.5 block">Email Address *</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="email"
                placeholder="your.email@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="pl-10 bg-white border-gray-300"
              />
            </div>
          </div>

          {/* Mobile Number */}
          <div>
            <Label className="text-sm text-gray-700 mb-1.5 block">Mobile Number *</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="tel"
                placeholder="+91 98765 43210"
                value={formData.mobile}
                onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                className="pl-10 bg-white border-gray-300"
              />
            </div>
          </div>

          {/* Country of Residency */}
          <div>
            <Label className="text-sm text-gray-700 mb-1.5 block">Country of Residency *</Label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <select
                value={formData.country_of_residency}
                onChange={(e) => setFormData({ ...formData, country_of_residency: e.target.value })}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-etihad-gold-500"
              >
                <option value="">Select your country</option>
                {COUNTRIES.map(country => (
                  <option key={country} value={country}>{country}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Passport Type */}
          <div>
            <Label className="text-sm text-gray-700 mb-1.5 block">Passport Type *</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, passport_type: 'indian' })}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  formData.passport_type === 'indian'
                    ? 'border-etihad-gold-500 bg-etihad-gold-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    formData.passport_type === 'indian' ? 'border-etihad-gold-500' : 'border-gray-300'
                  }`}>
                    {formData.passport_type === 'indian' && (
                      <div className="w-2 h-2 rounded-full bg-etihad-gold-500" />
                    )}
                  </div>
                  <span className="font-medium text-gray-800">Indian Passport</span>
                </div>
                <p className="text-xs text-gray-500 ml-6">PAN required, access to NCD & Real Estate</p>
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, passport_type: 'foreign' })}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  formData.passport_type === 'foreign'
                    ? 'border-etihad-gold-500 bg-etihad-gold-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    formData.passport_type === 'foreign' ? 'border-etihad-gold-500' : 'border-gray-300'
                  }`}>
                    {formData.passport_type === 'foreign' && (
                      <div className="w-2 h-2 rounded-full bg-etihad-gold-500" />
                    )}
                  </div>
                  <span className="font-medium text-gray-800">Foreign Passport</span>
                </div>
                <p className="text-xs text-gray-500 ml-6">Passport required, access to Real Estate & GIFT City</p>
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={saving}
            className="w-full bg-[#8B7355] hover:bg-[#7a6349] text-white py-3 rounded-md font-medium"
          >
            {saving ? 'Saving...' : 'Submit'}
          </Button>

          <p className="text-xs text-center text-gray-500">
            By submitting, you agree to our Terms of Service and Privacy Policy.
          </p>
        </form>

        {/* Footer */}
        <div className="p-4 text-center text-xs text-gray-500 border-t border-gray-200">
          <p>Kinntegraa L.L.C-FZ</p>
          <p>License No: 2418465.01</p>
        </div>
      </div>
    </div>
  );
};

export default PANRegistrationModal;
