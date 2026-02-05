import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Save, User, Users, HelpCircle, AlertCircle, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Dropdown options as per design document
const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" }
];

const RELATIONSHIP_OPTIONS = [
  { value: "Primary", label: "Self (Primary Holder)" },
  { value: "Spouse", label: "Spouse" },
  { value: "Partner", label: "Partner" },
  { value: "Son", label: "Son" },
  { value: "Daughter", label: "Daughter" },
  { value: "Father", label: "Father" },
  { value: "Mother", label: "Mother" },
  { value: "Brother", label: "Brother" },
  { value: "Sister", label: "Sister" },
  { value: "Grandparent", label: "Grandparent" },
  { value: "Grandchild", label: "Grandchild" },
  { value: "Other", label: "Other" }
];

const LIFE_EXPECTANCY_OPTIONS = [
  { value: 65, label: "65 years" },
  { value: 70, label: "70 years" },
  { value: 75, label: "75 years" },
  { value: 80, label: "80 years" },
  { value: 85, label: "85 years" },
  { value: 90, label: "90 years" },
  { value: 95, label: "95 years" },
  { value: 100, label: "100 years" }
];

const TAX_SLAB_OPTIONS = [
  { value: "0%", label: "0% (No Tax)" },
  { value: "5%", label: "5%" },
  { value: "10%", label: "10%" },
  { value: "15%", label: "15%" },
  { value: "20%", label: "20%" },
  { value: "25%", label: "25%" },
  { value: "30%", label: "30%" },
  { value: "surcharge", label: "30% + Surcharge" }
];

export default function FamilyForm({ onCancel, onSubmit, user, editFamily = null }) {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // Form state
  const [brokerId, setBrokerId] = useState("");
  const [subBrokerId, setSubBrokerId] = useState("");
  const [subBrokers, setSubBrokers] = useState([]);

  const [primaryHolder, setPrimaryHolder] = useState({
    first_name: "",
    last_name: "",
    date_of_birth: "",
    gender: "male",
    email: "",
    phone: "",
    life_expectancy: 80,
    tax_slab: "30%"
  });

  const [members, setMembers] = useState([]);

  useEffect(() => {
    fetchSubBrokers();
    
    // Set defaults based on user role
    if (user?.role === 'broker') {
      setBrokerId(user.id);
    } else if (user?.role === 'sub_broker') {
      setSubBrokerId(user.id);
      setBrokerId(user.broker_id || '');
    }
  }, [user]);

  const fetchSubBrokers = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/sub-brokers`, { 
        headers: { Authorization: `Bearer ${token}` } 
      }).catch(() => ({ data: [] }));
      
      setSubBrokers(Array.isArray(response.data) ? response.data : response.data.sub_brokers || []);
    } catch (error) {
      console.error("Error fetching sub-brokers:", error);
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    // Primary holder validation
    if (!primaryHolder.first_name.trim()) {
      newErrors.first_name = "First name is required";
    } else if (primaryHolder.first_name.length > 50) {
      newErrors.first_name = "First name must be less than 50 characters";
    }
    
    if (!primaryHolder.last_name.trim()) {
      newErrors.last_name = "Last name is required";
    } else if (primaryHolder.last_name.length > 50) {
      newErrors.last_name = "Last name must be less than 50 characters";
    }
    
    if (!primaryHolder.date_of_birth) {
      newErrors.date_of_birth = "Date of birth is required";
    } else {
      const dob = new Date(primaryHolder.date_of_birth);
      if (dob > new Date()) {
        newErrors.date_of_birth = "Date of birth must be in the past";
      }
    }
    
    if (primaryHolder.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(primaryHolder.email)) {
      newErrors.email = "Please enter a valid email address";
    }
    
    // Validate family members
    members.forEach((member, index) => {
      if (!member.first_name.trim()) {
        newErrors[`member_${index}_first_name`] = "First name is required";
      }
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const addMember = () => {
    setMembers([
      ...members,
      {
        id: Date.now(),
        first_name: "",
        last_name: "",
        date_of_birth: "",
        gender: "male",
        relation: "Spouse",
        life_expectancy: 80,
        tax_slab: "30%"
      }
    ]);
  };

  const removeMember = (id) => {
    if (window.confirm("Are you sure you want to remove this family member?")) {
      setMembers(members.filter(m => m.id !== id));
    }
  };

  const updateMember = (id, field, value) => {
    setMembers(members.map(m => 
      m.id === id ? { ...m, [field]: value } : m
    ));
    // Clear error for this field
    setErrors(prev => {
      const newErrors = { ...prev };
      const index = members.findIndex(m => m.id === id);
      delete newErrors[`member_${index}_${field}`];
      return newErrors;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error("Please fix the errors before submitting");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      
      const fullName = `${primaryHolder.first_name} ${primaryHolder.last_name}`.trim();
      
      const payload = {
        broker_id: brokerId || user?.id,
        sub_broker_id: subBrokerId || null,
        primary_holder: {
          name: fullName,
          date_of_birth: primaryHolder.date_of_birth,
          relation: "Primary",
          life_expectancy: parseInt(primaryHolder.life_expectancy),
          tax_slab: primaryHolder.tax_slab,
          // Additional fields from design
          first_name: primaryHolder.first_name,
          last_name: primaryHolder.last_name,
          gender: primaryHolder.gender,
          email: primaryHolder.email,
          phone: primaryHolder.phone
        },
        members: members.map(m => ({
          name: `${m.first_name} ${m.last_name}`.trim() || m.first_name,
          date_of_birth: m.date_of_birth,
          relation: m.relation,
          life_expectancy: parseInt(m.life_expectancy),
          tax_slab: m.tax_slab,
          first_name: m.first_name,
          last_name: m.last_name,
          gender: m.gender
        }))
      };

      const response = await axios.post(`${API}/data-gathering/family`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      onSubmit(response.data.family);
    } catch (error) {
      console.error("Error creating family:", error);
      toast.error(error.response?.data?.detail || "Failed to create family");
    } finally {
      setLoading(false);
    }
  };

  const calculateAge = (dob) => {
    if (!dob) return null;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const InputWithValidation = ({ label, error, required, helperText, children }) => (
    <div className="space-y-1">
      <Label className="flex items-center gap-1">
        {label}
        {required && <span className="text-red-500">*</span>}
        {helperText && (
          <HelpCircle className="h-3 w-3 text-gray-400 ml-1" />
        )}
      </Label>
      {children}
      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" onClick={onCancel} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>

      {/* Form Title & Purpose */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Introduction & Family Creation</h1>
        <p className="text-gray-500 mt-2">
          Help us get to know you and your family better. This information will be used to create a comprehensive financial plan tailored to your needs.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Introduction Section - Broker/Sub-broker */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Introduction</CardTitle>
            <CardDescription>Select the broker and sub-broker for this family profile</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label>Broker</Label>
                <Input
                  value={user?.role === 'broker' ? user?.name : 'Assigned Broker'}
                  disabled
                  className="bg-gray-50 mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">Read-only field</p>
              </div>
              <div>
                <Label>Sub-Broker (Optional)</Label>
                {user?.role === 'broker' ? (
                  <Select value={subBrokerId} onValueChange={setSubBrokerId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select sub-broker (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None - Direct Client</SelectItem>
                      {subBrokers.map(sb => (
                        <SelectItem key={sb.id} value={sb.id}>{sb.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={user?.name || ''}
                    disabled
                    className="bg-gray-50 mt-1"
                  />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Primary User Information Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5 text-etihad-gold-600" />
              Your Personal Information
            </CardTitle>
            <CardDescription>Primary account holder details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* First Name */}
              <InputWithValidation 
                label="First Name" 
                required 
                error={errors.first_name}
                helperText="Enter your given name"
              >
                <Input
                  value={primaryHolder.first_name}
                  onChange={(e) => {
                    setPrimaryHolder({ ...primaryHolder, first_name: e.target.value });
                    setErrors(prev => ({ ...prev, first_name: undefined }));
                  }}
                  placeholder="e.g., John"
                  className={`mt-1 ${errors.first_name ? 'border-red-500 focus:ring-red-500' : ''}`}
                  maxLength={50}
                />
              </InputWithValidation>

              {/* Last Name */}
              <InputWithValidation 
                label="Last Name" 
                required 
                error={errors.last_name}
                helperText="Enter your family name"
              >
                <Input
                  value={primaryHolder.last_name}
                  onChange={(e) => {
                    setPrimaryHolder({ ...primaryHolder, last_name: e.target.value });
                    setErrors(prev => ({ ...prev, last_name: undefined }));
                  }}
                  placeholder="e.g., Doe"
                  className={`mt-1 ${errors.last_name ? 'border-red-500 focus:ring-red-500' : ''}`}
                  maxLength={50}
                />
              </InputWithValidation>

              {/* Date of Birth */}
              <InputWithValidation 
                label="Date of Birth" 
                required 
                error={errors.date_of_birth}
                helperText="Select your birth date"
              >
                <div className="relative">
                  <Input
                    type="date"
                    value={primaryHolder.date_of_birth}
                    onChange={(e) => {
                      setPrimaryHolder({ ...primaryHolder, date_of_birth: e.target.value });
                      setErrors(prev => ({ ...prev, date_of_birth: undefined }));
                    }}
                    className={`mt-1 ${errors.date_of_birth ? 'border-red-500 focus:ring-red-500' : ''}`}
                    max={new Date().toISOString().split('T')[0]}
                  />
                  {primaryHolder.date_of_birth && (
                    <Badge variant="secondary" className="absolute right-2 top-1/2 -translate-y-1/2 text-xs">
                      Age: {calculateAge(primaryHolder.date_of_birth)}
                    </Badge>
                  )}
                </div>
              </InputWithValidation>

              {/* Gender */}
              <InputWithValidation label="Gender" required>
                <Select 
                  value={primaryHolder.gender} 
                  onValueChange={(v) => setPrimaryHolder({ ...primaryHolder, gender: v })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDER_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </InputWithValidation>

              {/* Email Address */}
              <InputWithValidation 
                label="Email Address" 
                error={errors.email}
                helperText="Used for notifications"
              >
                <Input
                  type="email"
                  value={primaryHolder.email}
                  onChange={(e) => {
                    setPrimaryHolder({ ...primaryHolder, email: e.target.value });
                    setErrors(prev => ({ ...prev, email: undefined }));
                  }}
                  placeholder="john.doe@example.com"
                  className={`mt-1 ${errors.email ? 'border-red-500 focus:ring-red-500' : ''}`}
                />
              </InputWithValidation>

              {/* Phone Number */}
              <InputWithValidation label="Phone Number" helperText="Optional contact number">
                <Input
                  type="tel"
                  value={primaryHolder.phone}
                  onChange={(e) => setPrimaryHolder({ ...primaryHolder, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="mt-1"
                />
              </InputWithValidation>

              {/* Life Expectancy */}
              <InputWithValidation 
                label="Life Expectancy" 
                required
                helperText="For financial planning calculations"
              >
                <Select 
                  value={String(primaryHolder.life_expectancy)} 
                  onValueChange={(v) => setPrimaryHolder({ ...primaryHolder, life_expectancy: parseInt(v) })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LIFE_EXPECTANCY_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </InputWithValidation>

              {/* Tax Slab */}
              <InputWithValidation 
                label="Tax Slab" 
                required
                helperText="Your current income tax bracket"
              >
                <Select 
                  value={primaryHolder.tax_slab} 
                  onValueChange={(v) => setPrimaryHolder({ ...primaryHolder, tax_slab: v })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TAX_SLAB_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </InputWithValidation>
            </div>
          </CardContent>
        </Card>

        {/* Family Members Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5 text-etihad-gold-600" />
                  Family Members
                </CardTitle>
                <CardDescription>
                  Add information about your family members. Click the button to add each member.
                </CardDescription>
              </div>
              <Button type="button" variant="outline" onClick={addMember} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Family Member
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed rounded-lg bg-gray-50">
                <Users className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-700 mb-2">No family members added</h3>
                <p className="text-gray-500 mb-4">
                  Click "Add Family Member" to include spouse, children, parents, or other family members.
                </p>
                <Button type="button" variant="outline" onClick={addMember} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Family Member
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Family Members Table Header */}
                <div className="hidden md:grid md:grid-cols-7 gap-4 px-4 py-2 bg-gray-100 rounded-lg text-sm font-medium text-gray-600">
                  <span>Relationship</span>
                  <span>First Name</span>
                  <span>Last Name</span>
                  <span>Date of Birth</span>
                  <span>Gender</span>
                  <span>Life Exp.</span>
                  <span>Actions</span>
                </div>

                {members.map((member, index) => (
                  <div key={member.id} className="border rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-4 md:hidden">
                      <Badge variant="outline" className="text-sm">
                        Member {index + 1}
                      </Badge>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm"
                        onClick={() => removeMember(member.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-7 gap-4 items-end">
                      {/* Relationship */}
                      <div>
                        <Label className="md:hidden text-xs text-gray-500">Relationship</Label>
                        <Select 
                          value={member.relation} 
                          onValueChange={(v) => updateMember(member.id, 'relation', v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {RELATIONSHIP_OPTIONS.filter(r => r.value !== 'Primary').map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* First Name */}
                      <div>
                        <Label className="md:hidden text-xs text-gray-500">First Name *</Label>
                        <Input
                          value={member.first_name}
                          onChange={(e) => updateMember(member.id, 'first_name', e.target.value)}
                          placeholder="First name"
                          className={errors[`member_${index}_first_name`] ? 'border-red-500' : ''}
                          maxLength={50}
                        />
                        {errors[`member_${index}_first_name`] && (
                          <p className="text-xs text-red-500 mt-1">{errors[`member_${index}_first_name`]}</p>
                        )}
                      </div>

                      {/* Last Name */}
                      <div>
                        <Label className="md:hidden text-xs text-gray-500">Last Name</Label>
                        <Input
                          value={member.last_name}
                          onChange={(e) => updateMember(member.id, 'last_name', e.target.value)}
                          placeholder="Last name"
                          maxLength={50}
                        />
                      </div>

                      {/* Date of Birth */}
                      <div>
                        <Label className="md:hidden text-xs text-gray-500">Date of Birth</Label>
                        <Input
                          type="date"
                          value={member.date_of_birth}
                          onChange={(e) => updateMember(member.id, 'date_of_birth', e.target.value)}
                          max={new Date().toISOString().split('T')[0]}
                        />
                      </div>

                      {/* Gender */}
                      <div>
                        <Label className="md:hidden text-xs text-gray-500">Gender</Label>
                        <Select 
                          value={member.gender} 
                          onValueChange={(v) => updateMember(member.id, 'gender', v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {GENDER_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Life Expectancy */}
                      <div>
                        <Label className="md:hidden text-xs text-gray-500">Life Exp.</Label>
                        <Select 
                          value={String(member.life_expectancy)} 
                          onValueChange={(v) => updateMember(member.id, 'life_expectancy', parseInt(v))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LIFE_EXPECTANCY_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={String(opt.value)}>{opt.value}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Actions */}
                      <div className="hidden md:flex justify-center">
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon"
                          onClick={() => removeMember(member.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Add More Button */}
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={addMember}
                  className="w-full border-dashed gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Another Family Member
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Form Summary */}
        {(primaryHolder.first_name || members.length > 0) && (
          <Card className="bg-gray-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="font-medium">Summary</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Family Name:</span>
                  <p className="font-medium">
                    {primaryHolder.first_name ? `${primaryHolder.first_name} ${primaryHolder.last_name} & Family` : '-'}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Total Members:</span>
                  <p className="font-medium">{1 + members.length}</p>
                </div>
                <div>
                  <span className="text-gray-500">Primary Holder Age:</span>
                  <p className="font-medium">
                    {primaryHolder.date_of_birth ? `${calculateAge(primaryHolder.date_of_birth)} years` : '-'}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Status:</span>
                  <Badge variant="secondary">Draft</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Separator />

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row justify-end gap-3">
          <Button 
            type="button" 
            variant="outline" 
            onClick={onCancel}
            className="sm:order-1"
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={loading || !primaryHolder.first_name || !primaryHolder.date_of_birth}
            className="bg-etihad-gold-600 hover:bg-etihad-gold-700 sm:order-2"
          >
            {loading ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                Creating...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Create Family Profile
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
