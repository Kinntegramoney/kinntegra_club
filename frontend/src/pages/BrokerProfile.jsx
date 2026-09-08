import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { User, Mail, Phone, Save, RefreshCw, Shield, Users, Briefcase } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function BrokerProfile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    phone: '',
    pan: '',
    sub_brokers_count: 0,
    clients_count: 0
  });
  const [originalProfile, setOriginalProfile] = useState(null);

  useEffect(() => {
    document.title = "Kinntegraa | My Profile";
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "broker") {
      toast.error("Only brokers can access this page");
      navigate("/sub-broker/dashboard");
      return;
    }
    
    setUser(parsedUser);
    fetchProfile();
  }, [navigate]);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/broker/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProfile(response.data);
      setOriginalProfile(response.data);
    } catch (error) {
      console.error("Error fetching profile:", error);
      toast.error("Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  const hasChanges = () => {
    if (!originalProfile) return false;
    return (
      profile.name !== originalProfile.name ||
      profile.email !== originalProfile.email ||
      profile.phone !== originalProfile.phone
    );
  };

  const handleSave = async () => {
    if (!hasChanges()) {
      toast.info("No changes to save");
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      const updateData = {};
      
      if (profile.name !== originalProfile.name) updateData.name = profile.name;
      if (profile.email !== originalProfile.email) updateData.email = profile.email;
      if (profile.phone !== originalProfile.phone) updateData.phone = profile.phone;

      await axios.put(`${API}/broker/profile`, updateData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Update local storage if name changed
      if (updateData.name) {
        const userData = JSON.parse(localStorage.getItem("user") || '{}');
        userData.name = updateData.name;
        localStorage.setItem("user", JSON.stringify(userData));
        setUser(userData);
      }

      toast.success("Profile updated successfully");
      setOriginalProfile({ ...profile });
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error(error.response?.data?.detail || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (originalProfile) {
      setProfile({ ...originalProfile });
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-100">
        <Sidebar user={user} />
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-etihad-gold-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-etihad-gold-100 rounded-lg">
              <User className="h-6 w-6 text-etihad-gold-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800" data-testid="profile-title">My Profile</h1>
              <p className="text-sm text-gray-500">Manage your account information</p>
            </div>
          </div>
        </div>

        <div className="p-6 max-w-4xl">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gradient-to-br from-etihad-gold-500 to-amber-600 rounded-xl p-4 text-white">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                <span className="text-etihad-gold-100 text-sm">Role</span>
              </div>
              <p className="text-xl font-bold mt-1">Broker</p>
            </div>
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl p-4 text-white">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                <span className="text-blue-100 text-sm">Sub-Brokers</span>
              </div>
              <p className="text-xl font-bold mt-1">{profile.sub_brokers_count || 0}</p>
            </div>
            <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-4 text-white">
              <div className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                <span className="text-green-100 text-sm">Investors</span>
              </div>
              <p className="text-xl font-bold mt-1">{profile.clients_count || 0}</p>
            </div>
          </div>

          {/* Profile Form */}
          <div className="bg-white rounded-xl border p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Account Information</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-2">
                  <User className="h-4 w-4 text-gray-400" />
                  Full Name
                </Label>
                <Input
                  id="name"
                  data-testid="profile-name-input"
                  value={profile.name || ''}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="Enter your name"
                  className="focus:ring-etihad-gold-500 focus:border-etihad-gold-500"
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-gray-400" />
                  Email Address
                </Label>
                <Input
                  id="email"
                  data-testid="profile-email-input"
                  type="email"
                  value={profile.email || ''}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="Enter your email"
                  className="focus:ring-etihad-gold-500 focus:border-etihad-gold-500"
                />
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gray-400" />
                  Phone Number
                </Label>
                <Input
                  id="phone"
                  data-testid="profile-phone-input"
                  value={profile.phone || ''}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="Enter your phone number"
                  className="focus:ring-etihad-gold-500 focus:border-etihad-gold-500"
                />
              </div>

              {/* PAN (Read Only) */}
              <div className="space-y-2">
                <Label htmlFor="pan" className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-gray-400" />
                  PAN Number
                </Label>
                <Input
                  id="pan"
                  data-testid="profile-pan-input"
                  value={profile.pan || ''}
                  disabled
                  className="bg-gray-50 text-gray-500 cursor-not-allowed"
                />
                <p className="text-xs text-gray-400">PAN cannot be changed</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t">
              {hasChanges() && (
                <span className="text-sm text-etihad-gold-600 font-medium mr-auto flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-etihad-gold-500 animate-pulse"></span>
                  Unsaved changes
                </span>
              )}
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={!hasChanges() || saving}
              >
                Reset
              </Button>
              <Button
                onClick={handleSave}
                disabled={!hasChanges() || saving}
                className="bg-etihad-gold-600 hover:bg-etihad-gold-700"
                data-testid="save-profile-btn"
              >
                {saving ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
