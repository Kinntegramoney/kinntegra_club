import { useState } from "react";
import axios from "axios";
import { X, Copy, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const COUNTRIES = ["India", "United States", "United Kingdom", "UAE", "Singapore"];
const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

const COLORS = [
  { name: "Brown", value: "#78716C" },
  { name: "Blue", value: "#3B82F6" },
  { name: "Green", value: "#10B981" },
  { name: "Purple", value: "#8B5CF6" },
  { name: "Red", value: "#EF4444" },
  { name: "Orange", value: "#F59E0B" },
  { name: "Pink", value: "#EC4899" },
  { name: "Teal", value: "#14B8A6" }
];

export default function CreatePartnerModal({ onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: "",
    pan: "",
    partner_code: "",
    email: "",
    mobile: "",
    color: "#78716C",
    address_line1: "",
    address_line2: "",
    city: "",
    country: "India",
    state: "",
    pincode: ""
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate required fields
    const requiredFields = ['name', 'pan', 'partner_code', 'email', 'mobile', 'address_line1', 'address_line2', 'city', 'country', 'state', 'pincode'];
    const missingFields = requiredFields.filter(field => !formData[field]);
    
    if (missingFields.length > 0) {
      toast.error("Please fill all required fields");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      
      // Generate password and PIN for the partner
      const password = `partner${Math.random().toString(36).slice(2, 10)}`;
      const pin = Math.floor(1000 + Math.random() * 9000).toString();
      
      await axios.post(`${API}/partners`, {
        ...formData,
        password,
        pin
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success(`Partner created! Password: ${password}, PIN: ${pin}`);
      onSuccess();
    } catch (error) {
      console.error("Error creating partner:", error);
      toast.error(error.response?.data?.detail || "Failed to create partner");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold" style={{ color: '#78716C' }}>Create Partner</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6">
          {/* PARTNER DETAILS */}
          <div className="mb-8">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">PARTNER DETAILS</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">NAME (AS PER PAN CARD) *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">PAN NUMBER *</Label>
                <Input
                  value={formData.pan}
                  onChange={(e) => setFormData({...formData, pan: e.target.value.toUpperCase()})}
                  maxLength={10}
                  className="font-mono"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">PARTNER CODE *</Label>
                <Input
                  value={formData.partner_code}
                  onChange={(e) => setFormData({...formData, partner_code: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">EMAIL *</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">MOBILE NO *</Label>
                <Input
                  type="tel"
                  value={formData.mobile}
                  onChange={(e) => setFormData({...formData, mobile: e.target.value})}
                  placeholder="+91 or Ext"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">CHOOSE COLOUR *</Label>
                <div className="flex gap-2">
                  {COLORS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setFormData({...formData, color: color.value})}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        formData.color === color.value ? 'border-gray-800 scale-110' : 'border-gray-300'
                      }`}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ADDRESS DETAILS */}
          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">ADDRESS DETAILS</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">ADDRESS LINE 1 *</Label>
                <Input
                  value={formData.address_line1}
                  onChange={(e) => setFormData({...formData, address_line1: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">ADDRESS LINE 2 *</Label>
                <Input
                  value={formData.address_line2}
                  onChange={(e) => setFormData({...formData, address_line2: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">CITY *</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({...formData, city: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">COUNTRY *</Label>
                <Select value={formData.country} onValueChange={(value) => setFormData({...formData, country: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map(country => (
                      <SelectItem key={country} value={country}>{country}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">STATE *</Label>
                <Select value={formData.state} onValueChange={(value) => setFormData({...formData, state: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDIAN_STATES.map(state => (
                      <SelectItem key={state} value={state}>{state}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase">PINCODE *</Label>
                <Input
                  value={formData.pincode}
                  onChange={(e) => setFormData({...formData, pincode: e.target.value})}
                  maxLength={6}
                  className="font-mono"
                  required
                />
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="bg-amber-700 hover:bg-amber-800 text-white"
          >
            {loading ? "CREATING..." : "SAVE CHANGES"}
          </Button>
        </div>
      </div>
    </div>
  );
}