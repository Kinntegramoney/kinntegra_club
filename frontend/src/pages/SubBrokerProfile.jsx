import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { User, Mail, Phone, Key, Lock, Save, Eye, EyeOff, MapPin, Building, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function SubBrokerProfile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Edit states
  const [editingEmail, setEditingEmail] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [editingPin, setEditingPin] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  
  // Form values
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  
  // Address fields
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [country, setCountry] = useState("");
  
  // Visibility toggles
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  useEffect(() => {
    document.title = "Kinntegraa | Profile";
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "sub_broker") {
      navigate("/broker/dashboard");
      return;
    }
    
    setUser(parsedUser);
    fetchProfile();
  }, [navigate]);

  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/sub-broker/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProfile(response.data);
      setNewEmail(response.data.email || "");
      setNewPhone(response.data.mobile || response.data.phone || "");
      // Set address fields
      setAddressLine1(response.data.address_line1 || "");
      setAddressLine2(response.data.address_line2 || "");
      setCity(response.data.city || "");
      setState(response.data.state || "");
      setPincode(response.data.pincode || "");
      setCountry(response.data.country || "India");
      setLoading(false);
    } catch (error) {
      console.error("Error fetching profile:", error);
      toast.error("Failed to load profile");
      setLoading(false);
    }
  };

  const handleUpdateEmail = async () => {
    if (!newEmail || !newEmail.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }
    
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/sub-broker/profile/email`, 
        { email: newEmail },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Email updated successfully");
      setEditingEmail(false);
      fetchProfile();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update email");
    }
  };

  const handleUpdatePhone = async () => {
    if (!newPhone || newPhone.length < 10) {
      toast.error("Please enter a valid phone number");
      return;
    }
    
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/sub-broker/profile/phone`, 
        { phone: newPhone },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Phone number updated successfully");
      setEditingPhone(false);
      fetchProfile();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update phone");
    }
  };

  const handleUpdatePassword = async () => {
    if (!currentPassword) {
      toast.error("Please enter your current password");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/sub-broker/profile/password`, 
        { current_password: currentPassword, new_password: newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Password updated successfully");
      setEditingPassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update password");
    }
  };

  const handleUpdatePin = async () => {
    if (!currentPin || currentPin.length !== 4) {
      toast.error("Please enter your current 4-digit PIN");
      return;
    }
    if (!newPin || newPin.length !== 4 || !/^\d+$/.test(newPin)) {
      toast.error("New PIN must be exactly 4 digits");
      return;
    }
    if (newPin !== confirmPin) {
      toast.error("PINs do not match");
      return;
    }
    
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/sub-broker/profile/pin`, 
        { current_pin: currentPin, new_pin: newPin },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("PIN updated successfully");
      setEditingPin(false);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update PIN");
    }
  };

  const handleUpdateAddress = async () => {
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/sub-broker/profile/address`, 
        { 
          address_line1: addressLine1,
          address_line2: addressLine2,
          city,
          state,
          pincode,
          country
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Address updated successfully");
      setEditingAddress(false);
      fetchProfile();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update address");
    }
  };

  if (!user || loading) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar user={user} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-6">
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">My Profile</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your account settings and credentials</p>
        </div>

        <div className="p-4 md:p-8 max-w-3xl">
          {/* Profile Card */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Profile Header */}
            <div className="bg-gradient-to-r from-etihad-gold-500 to-orange-500 p-6">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center text-white text-2xl font-bold">
                  {profile?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'SB'}
                </div>
                <div className="text-white">
                  <h2 className="text-2xl font-bold">{profile?.name}</h2>
                  <p className="text-etihad-gold-100">Partner Code: {profile?.partner_code}</p>
                </div>
              </div>
            </div>

            {/* Profile Details */}
            <div className="p-6 space-y-6">
              {/* Email Section */}
              <div className="border-b border-gray-100 pb-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-gray-400" />
                    <Label className="font-medium text-gray-700">Email Address</Label>
                  </div>
                  {!editingEmail && (
                    <Button variant="ghost" size="sm" onClick={() => setEditingEmail(true)}>
                      Edit
                    </Button>
                  )}
                </div>
                {editingEmail ? (
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="Enter new email"
                    />
                    <Button onClick={handleUpdateEmail} size="sm">
                      <Save className="h-4 w-4 mr-1" /> Save
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setEditingEmail(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <p className="text-gray-600 ml-7">{profile?.email || "Not set"}</p>
                )}
              </div>

              {/* Phone Section */}
              <div className="border-b border-gray-100 pb-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Phone className="h-5 w-5 text-gray-400" />
                    <Label className="font-medium text-gray-700">Phone Number</Label>
                  </div>
                  {!editingPhone && (
                    <Button variant="ghost" size="sm" onClick={() => setEditingPhone(true)}>
                      Edit
                    </Button>
                  )}
                </div>
                {editingPhone ? (
                  <div className="flex gap-2">
                    <Input
                      type="tel"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="Enter new phone number"
                    />
                    <Button onClick={handleUpdatePhone} size="sm">
                      <Save className="h-4 w-4 mr-1" /> Save
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setEditingPhone(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <p className="text-gray-600 ml-7">{profile?.mobile || profile?.phone || "Not set"}</p>
                )}
              </div>

              {/* Password Section */}
              <div className="border-b border-gray-100 pb-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Key className="h-5 w-5 text-gray-400" />
                    <Label className="font-medium text-gray-700">Password</Label>
                  </div>
                  {!editingPassword && (
                    <Button variant="ghost" size="sm" onClick={() => setEditingPassword(true)}>
                      Change
                    </Button>
                  )}
                </div>
                {editingPassword ? (
                  <div className="space-y-3 ml-7">
                    <div className="relative">
                      <Input
                        type={showCurrentPassword ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Current password"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      >
                        {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="New password (min 6 characters)"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                    />
                    <div className="flex gap-2">
                      <Button onClick={handleUpdatePassword} size="sm">
                        <Save className="h-4 w-4 mr-1" /> Update Password
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => {
                        setEditingPassword(false);
                        setCurrentPassword("");
                        setNewPassword("");
                        setConfirmPassword("");
                      }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-600 ml-7">••••••••</p>
                )}
              </div>

              {/* PIN Section */}
              <div className="border-b border-gray-100 pb-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Lock className="h-5 w-5 text-gray-400" />
                    <Label className="font-medium text-gray-700">Login PIN</Label>
                  </div>
                  {!editingPin && (
                    <Button variant="ghost" size="sm" onClick={() => setEditingPin(true)}>
                      Change
                    </Button>
                  )}
                </div>
                {editingPin ? (
                  <div className="space-y-3 ml-7">
                    <Input
                      type="password"
                      value={currentPin}
                      onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="Current PIN (4 digits)"
                      maxLength={4}
                    />
                    <Input
                      type="password"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="New PIN (4 digits)"
                      maxLength={4}
                    />
                    <Input
                      type="password"
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="Confirm new PIN"
                      maxLength={4}
                    />
                    <div className="flex gap-2">
                      <Button onClick={handleUpdatePin} size="sm">
                        <Save className="h-4 w-4 mr-1" /> Update PIN
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => {
                        setEditingPin(false);
                        setCurrentPin("");
                        setNewPin("");
                        setConfirmPin("");
                      }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-600 ml-7">••••</p>
                )}
              </div>

              {/* Address Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-gray-400" />
                    <Label className="font-medium text-gray-700">Address</Label>
                  </div>
                  {!editingAddress && (
                    <Button variant="ghost" size="sm" onClick={() => setEditingAddress(true)}>
                      {profile?.address_line1 ? 'Edit' : 'Add'}
                    </Button>
                  )}
                </div>
                {editingAddress ? (
                  <div className="space-y-3 ml-7">
                    <Input
                      value={addressLine1}
                      onChange={(e) => setAddressLine1(e.target.value)}
                      placeholder="Address Line 1"
                    />
                    <Input
                      value={addressLine2}
                      onChange={(e) => setAddressLine2(e.target.value)}
                      placeholder="Address Line 2 (optional)"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="City"
                      />
                      <Input
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        placeholder="State"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={pincode}
                        onChange={(e) => setPincode(e.target.value)}
                        placeholder="Pincode"
                      />
                      <Input
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        placeholder="Country"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleUpdateAddress} size="sm">
                        <Save className="h-4 w-4 mr-1" /> Save Address
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => {
                        setEditingAddress(false);
                        // Reset to profile values
                        setAddressLine1(profile?.address_line1 || "");
                        setAddressLine2(profile?.address_line2 || "");
                        setCity(profile?.city || "");
                        setState(profile?.state || "");
                        setPincode(profile?.pincode || "");
                        setCountry(profile?.country || "India");
                      }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-600 ml-7">
                    {profile?.address_line1 ? (
                      <div className="text-sm">
                        <p>{profile.address_line1}</p>
                        {profile.address_line2 && <p>{profile.address_line2}</p>}
                        <p>{profile.city}, {profile.state} {profile.pincode}</p>
                        <p>{profile.country}</p>
                      </div>
                    ) : (
                      <p className="text-gray-400 italic">No address added</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Additional Info */}
          <div className="mt-6 bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-800 mb-4">Account Information</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Partner Code</p>
                <p className="font-mono font-medium">{profile?.partner_code}</p>
              </div>
              <div>
                <p className="text-gray-500">Status</p>
                <p className={`font-medium ${profile?.is_active ? 'text-green-600' : 'text-red-600'}`}>
                  {profile?.is_active ? 'Active' : 'Inactive'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Linked Clients</p>
                <p className="font-medium">{profile?.linked_clients_count || 0}</p>
              </div>
              <div>
                <p className="text-gray-500">Member Since</p>
                <p className="font-medium">
                  {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
