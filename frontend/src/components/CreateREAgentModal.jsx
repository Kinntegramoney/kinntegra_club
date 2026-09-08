import { useState } from "react";
import axios from "axios";
import { X, Building2, Copy, Check, AlertTriangle, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function CreateREAgentModal({ open, onOpenChange, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [credentials, setCredentials] = useState({ brn: "", password: "", pin: "", name: "", email: "" });
  const [copiedField, setCopiedField] = useState(null);
  
  const [formData, setFormData] = useState({
    // Personal Information
    full_name: "",
    email: "",
    mobile_number: "",
    
    // Licensing Information
    rera_number: "",
    brn_number: "",
    
    // Professional Information
    specialization: "",
    years_of_experience: "",
    areas_of_operation: "",
    about: ""
  });

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast.success("Copied to clipboard!");
  };

  const resetForm = () => {
    setFormData({
      full_name: "",
      email: "",
      mobile_number: "",
      rera_number: "",
      brn_number: "",
      specialization: "",
      years_of_experience: "",
      areas_of_operation: "",
      about: ""
    });
    setShowCredentials(false);
    setCredentials({ brn: "", password: "", pin: "", name: "", email: "" });
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!formData.full_name || !formData.email || !formData.mobile_number) {
      toast.error("Please fill in Full Name, Email, and Mobile Number");
      return;
    }
    
    if (!formData.brn_number) {
      toast.error("BRN Number is required (will be used as login ID)");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      
      const response = await axios.post(`${API}/re-broker/agents/create`, {
        name: formData.full_name,
        email: formData.email,
        mobile: formData.mobile_number,
        brn: formData.brn_number,
        rera_id: formData.rera_number,
        specializations: formData.specialization ? [formData.specialization] : [],
        experience_years: formData.years_of_experience,
        areas_covered: formData.areas_of_operation ? formData.areas_of_operation.split(',').map(a => a.trim()) : [],
        about: formData.about
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const agentData = response.data;
      
      setCredentials({
        name: formData.full_name,
        brn: formData.brn_number.toUpperCase(),
        email: formData.email,
        password: agentData.default_password || "kinntegra123",
        pin: agentData.default_pin || "1234"
      });
      setShowCredentials(true);
      
    } catch (error) {
      console.error("Error creating agent:", error);
      toast.error(error.response?.data?.detail || "Failed to create agent");
    } finally {
      setLoading(false);
    }
  };

  const handleCredentialsClose = () => {
    setShowCredentials(false);
    resetForm();
    onSuccess({
      brn: credentials.brn,
      name: credentials.name,
      email: credentials.email
    });
    onOpenChange(false);
  };

  // Credentials Dialog
  if (showCredentials) {
    return (
      <Dialog open={true} onOpenChange={() => {}}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <Check className="h-5 w-5" />
              Agent Created Successfully!
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-semibold">Important: Save these credentials!</p>
                <p>Please share these login details with the agent.</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-gray-700 mb-3">Login Credentials for {credentials.name}</h3>
              
              <div className="flex items-center justify-between bg-white rounded-md p-3 border">
                <div>
                  <p className="text-xs text-gray-500 uppercase">BRN (Username)</p>
                  <p className="font-mono font-semibold text-lg">{credentials.brn}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(credentials.brn, 'brn')}>
                  {copiedField === 'brn' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>

              <div className="flex items-center justify-between bg-white rounded-md p-3 border">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Password</p>
                  <p className="font-mono font-semibold text-lg">{credentials.password}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(credentials.password, 'password')}>
                  {copiedField === 'password' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>

              <div className="flex items-center justify-between bg-white rounded-md p-3 border">
                <div>
                  <p className="text-xs text-gray-500 uppercase">PIN (2-Step Verification)</p>
                  <p className="font-mono font-semibold text-lg">{credentials.pin}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(credentials.pin, 'pin')}>
                  {copiedField === 'pin' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>

              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={() => copyToClipboard(
                  `Login Credentials for ${credentials.name}\n\nBRN (Username): ${credentials.brn}\nPassword: ${credentials.password}\nPIN: ${credentials.pin}\n\nLogin URL: https://kinntegraa.club/login`,
                  'all'
                )}
              >
                {copiedField === 'all' ? <Check className="h-4 w-4 mr-2 text-green-500" /> : <Copy className="h-4 w-4 mr-2" />}
                Copy All Credentials
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button 
              className="w-full bg-green-600 hover:bg-green-700"
              onClick={handleCredentialsClose}
            >
              I&apos;ve Saved the Credentials - Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-purple-600" />
            Add Agent
          </DialogTitle>
          <DialogDescription>
            Create a new Real Estate Agent account
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          {/* Personal Information */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wider">Personal Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input
                  value={formData.full_name}
                  onChange={(e) => updateField('full_name', e.target.value)}
                  placeholder="John Doe"
                  data-testid="agent-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="john@example.com"
                  data-testid="agent-email"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Mobile Number *</Label>
                <Input
                  value={formData.mobile_number}
                  onChange={(e) => updateField('mobile_number', e.target.value)}
                  placeholder="+971 50 123 4567"
                  data-testid="agent-mobile"
                />
              </div>
            </div>
          </div>

          {/* Licensing Information */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wider">Licensing Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>RERA Number</Label>
                <Input
                  value={formData.rera_number}
                  onChange={(e) => updateField('rera_number', e.target.value)}
                  placeholder="RERA-XXXXX"
                  className="font-mono"
                  data-testid="agent-rera"
                />
              </div>
              <div className="space-y-2">
                <Label>BRN Number * (Login ID)</Label>
                <Input
                  value={formData.brn_number}
                  onChange={(e) => updateField('brn_number', e.target.value.toUpperCase())}
                  placeholder="BRN-XXXXX"
                  className="font-mono"
                  data-testid="agent-brn"
                />
                <p className="text-xs text-gray-400">This will be used as the login ID</p>
              </div>
            </div>
          </div>

          {/* Professional Information */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wider">Professional Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Specialization</Label>
                <Select 
                  value={formData.specialization} 
                  onValueChange={(value) => updateField('specialization', value)}
                >
                  <SelectTrigger data-testid="agent-specialization">
                    <SelectValue placeholder="Select specialization" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="residential">Residential</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                    <SelectItem value="luxury">Luxury Properties</SelectItem>
                    <SelectItem value="off_plan">Off-Plan</SelectItem>
                    <SelectItem value="rental">Rental</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Years of Experience</Label>
                <Select 
                  value={formData.years_of_experience} 
                  onValueChange={(value) => updateField('years_of_experience', value)}
                >
                  <SelectTrigger data-testid="agent-experience">
                    <SelectValue placeholder="Select experience" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0-2">0-2 Years</SelectItem>
                    <SelectItem value="2-5">2-5 Years</SelectItem>
                    <SelectItem value="5-10">5-10 Years</SelectItem>
                    <SelectItem value="10+">10+ Years</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Areas of Operation</Label>
                <Input
                  value={formData.areas_of_operation}
                  onChange={(e) => updateField('areas_of_operation', e.target.value)}
                  placeholder="Dubai Marina, Downtown, Palm Jumeirah"
                  data-testid="agent-areas"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>About</Label>
                <Textarea
                  value={formData.about}
                  onChange={(e) => updateField('about', e.target.value)}
                  placeholder="Brief description about the agent..."
                  rows={3}
                  data-testid="agent-about"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={loading}
            className="bg-purple-600 hover:bg-purple-700"
            data-testid="create-agent-submit"
          >
            {loading ? "Creating..." : "Create Agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
