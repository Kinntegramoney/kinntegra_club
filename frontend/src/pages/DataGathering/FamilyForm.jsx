import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Save, User, Users, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Relationship options
const RELATIONSHIP_OPTIONS = [
  { value: "Primary", label: "Self (Primary Holder)" },
  { value: "Spouse", label: "Spouse" },
  { value: "Son", label: "Son" },
  { value: "Daughter", label: "Daughter" },
  { value: "Father", label: "Father" },
  { value: "Mother", label: "Mother" },
  { value: "Brother", label: "Brother" },
  { value: "Sister", label: "Sister" },
  { value: "Other", label: "Other" }
];

// Life Expectancy options
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

// Tax Regime options
const TAX_REGIME_OPTIONS = [
  { value: "old", label: "Old Tax Regime" },
  { value: "new", label: "New Tax Regime" }
];

// Tax % options based on regime
const TAX_PERCENT_OPTIONS = {
  old: [
    { value: "0", label: "0%" },
    { value: "5", label: "5%" },
    { value: "10", label: "10%" },
    { value: "15", label: "15%" },
    { value: "20", label: "20%" },
    { value: "30", label: "30%" }
  ],
  new: [
    { value: "0", label: "0%" },
    { value: "5", label: "5%" },
    { value: "10", label: "10%" },
    { value: "15", label: "15%" },
    { value: "20", label: "20%" },
    { value: "25", label: "25%" },
    { value: "30", label: "30%" }
  ]
};

// Next step options
const NEXT_STEP_OPTIONS = [
  { value: "account_opening", label: "Proceed to Account Opening" },
  { value: "data_gathering", label: "Continue with Data Gathering" }
];

export default function FamilyForm({ onCancel, onSubmit, user, editFamily = null }) {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // Form state
  const [subBrokerId, setSubBrokerId] = useState("");
  const [subBrokers, setSubBrokers] = useState([]);
  const [loadingSubBrokers, setLoadingSubBrokers] = useState(true);

  // Primary holder state
  const [primaryHolder, setPrimaryHolder] = useState({
    name_as_per_pan: "",
    date_of_birth: "",
    life_expectancy: 80,
    tax_regime: "new",
    tax_percent: "30"
  });

  // Family name (auto-generated)
  const [familyName, setFamilyName] = useState("");

  // Family members
  const [members, setMembers] = useState([]);

  // Next step selection
  const [nextStep, setNextStep] = useState("data_gathering");

  useEffect(() => {
    fetchSubBrokers();
    
    // Set sub-broker if user is sub-broker
    if (user?.role === 'sub_broker') {
      setSubBrokerId(user.id);
    }
  }, [user]);

  // Auto-generate family name when primary holder name changes
  useEffect(() => {
    if (primaryHolder.name_as_per_pan.trim()) {
      setFamilyName(`${primaryHolder.name_as_per_pan.trim()} & Family`);
    } else {
      setFamilyName("");
    }
  }, [primaryHolder.name_as_per_pan]);

  const fetchSubBrokers = async () => {
    setLoadingSubBrokers(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/sub-brokers`, { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      
      const sbList = Array.isArray(response.data) ? response.data : response.data.sub_brokers || [];
      setSubBrokers(sbList);
    } catch (error) {
      console.error("Error fetching sub-brokers:", error);
      setSubBrokers([]);
    } finally {
      setLoadingSubBrokers(false);
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    // Primary holder validation
    if (!primaryHolder.name_as_per_pan.trim()) {
      newErrors.name_as_per_pan = "Name as per PAN is required";
    }
    
    if (!primaryHolder.date_of_birth) {
      newErrors.date_of_birth = "Date of birth is required";
    } else {
      const dob = new Date(primaryHolder.date_of_birth);
      if (dob > new Date()) {
        newErrors.date_of_birth = "Date of birth must be in the past";
      }
    }
    
    // Validate family members
    members.forEach((member, index) => {
      if (!member.name_as_per_pan.trim()) {
        newErrors[`member_${index}_name`] = "Name is required";
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
        name_as_per_pan: "",
        date_of_birth: "",
        relation: "Spouse",
        life_expectancy: 80,
        tax_regime: "new",
        tax_percent: "30"
      }
    ]);
  };

  const removeMember = (id) => {
    if (window.confirm("Remove this family member?")) {
      setMembers(members.filter(m => m.id !== id));
    }
  };

  const updateMember = (id, field, value) => {
    setMembers(members.map(m => 
      m.id === id ? { ...m, [field]: value } : m
    ));
    // Clear error
    const index = members.findIndex(m => m.id === id);
    if (index !== -1) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[`member_${index}_name`];
        return newErrors;
      });
    }
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
      
      const payload = {
        broker_id: user?.role === 'broker' ? user.id : user?.broker_id,
        sub_broker_id: subBrokerId || null,
        primary_holder: {
          name: primaryHolder.name_as_per_pan,
          date_of_birth: primaryHolder.date_of_birth,
          relation: "Primary",
          life_expectancy: parseInt(primaryHolder.life_expectancy),
          tax_slab: `${primaryHolder.tax_percent}%`,
          tax_regime: primaryHolder.tax_regime,
          name_as_per_pan: primaryHolder.name_as_per_pan
        },
        members: members.map(m => ({
          name: m.name_as_per_pan,
          date_of_birth: m.date_of_birth,
          relation: m.relation,
          life_expectancy: parseInt(m.life_expectancy),
          tax_slab: `${m.tax_percent}%`,
          tax_regime: m.tax_regime,
          name_as_per_pan: m.name_as_per_pan
        }))
      };

      const response = await axios.post(`${API}/data-gathering/family`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const createdFamily = response.data.family;
      
      // Navigate based on next step selection
      if (nextStep === "account_opening") {
        toast.success("Family created! Redirecting to account opening...");
        // Could navigate to account opening page
        onSubmit(createdFamily, "account_opening");
      } else {
        toast.success("Family created! Continue with data gathering...");
        onSubmit(createdFamily, "data_gathering");
      }
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

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" onClick={onCancel} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>

      {/* Form Title */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Introduction</h1>
        <p className="text-gray-500 mt-2">
          Create a new family profile for financial planning
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Introduction - Sub-broker Selection */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">1. Introduction</CardTitle>
            <CardDescription>Select the sub-broker managing this client</CardDescription>
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
              </div>
              <div>
                <Label>Sub-Broker</Label>
                {user?.role === 'broker' ? (
                  <Select value={subBrokerId} onValueChange={setSubBrokerId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={loadingSubBrokers ? "Loading..." : "Select sub-broker"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None - Direct Client</SelectItem>
                      {subBrokers.map(sb => (
                        <SelectItem key={sb.id} value={sb.id}>
                          {sb.name} {sb.email ? `(${sb.email})` : ''}
                        </SelectItem>
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
                {user?.role === 'broker' && subBrokers.length === 0 && !loadingSubBrokers && (
                  <p className="text-xs text-gray-500 mt-1">No sub-brokers available in the system</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Family Name (Auto-populated) */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">2. Family Name</CardTitle>
            <CardDescription>Auto-generated based on primary holder's name</CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <Label>Family Name</Label>
              <Input
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder="Will be auto-generated after entering primary holder name"
                className="mt-1"
              />
              {!familyName && (
                <p className="text-xs text-amber-600 mt-1">
                  Enter primary holder's name below to auto-generate family name
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Primary Holder Details */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5 text-etihad-gold-600" />
              3. Primary Holder Details
            </CardTitle>
            <CardDescription>Enter the primary account holder information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Name as per PAN */}
              <div className="md:col-span-2 lg:col-span-1">
                <Label>
                  Name as per PAN <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={primaryHolder.name_as_per_pan}
                  onChange={(e) => {
                    setPrimaryHolder({ ...primaryHolder, name_as_per_pan: e.target.value });
                    setErrors(prev => ({ ...prev, name_as_per_pan: undefined }));
                  }}
                  placeholder="Enter name exactly as on PAN card"
                  className={`mt-1 ${errors.name_as_per_pan ? 'border-red-500' : ''}`}
                />
                {errors.name_as_per_pan && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.name_as_per_pan}
                  </p>
                )}
              </div>

              {/* Date of Birth */}
              <div>
                <Label>
                  Date of Birth <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    type="date"
                    value={primaryHolder.date_of_birth}
                    onChange={(e) => {
                      setPrimaryHolder({ ...primaryHolder, date_of_birth: e.target.value });
                      setErrors(prev => ({ ...prev, date_of_birth: undefined }));
                    }}
                    className={`mt-1 ${errors.date_of_birth ? 'border-red-500' : ''}`}
                    max={new Date().toISOString().split('T')[0]}
                  />
                  {primaryHolder.date_of_birth && (
                    <Badge variant="secondary" className="absolute right-2 top-1/2 -translate-y-1/2 text-xs">
                      Age: {calculateAge(primaryHolder.date_of_birth)}
                    </Badge>
                  )}
                </div>
                {errors.date_of_birth && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.date_of_birth}
                  </p>
                )}
              </div>

              {/* Relation (Fixed as Primary) */}
              <div>
                <Label>Relation</Label>
                <Input
                  value="Self (Primary Holder)"
                  disabled
                  className="mt-1 bg-gray-50"
                />
              </div>

              {/* Life Expectancy */}
              <div>
                <Label>Life Expectancy</Label>
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
              </div>

              {/* Tax Regime */}
              <div>
                <Label>Tax Regime</Label>
                <Select 
                  value={primaryHolder.tax_regime} 
                  onValueChange={(v) => setPrimaryHolder({ ...primaryHolder, tax_regime: v, tax_percent: "30" })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TAX_REGIME_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tax % */}
              <div>
                <Label>Tax %</Label>
                <Select 
                  value={primaryHolder.tax_percent} 
                  onValueChange={(v) => setPrimaryHolder({ ...primaryHolder, tax_percent: v })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TAX_PERCENT_OPTIONS[primaryHolder.tax_regime].map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 4: Family Members */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5 text-etihad-gold-600" />
                  4. Family Members
                </CardTitle>
                <CardDescription>Add other family members (optional)</CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addMember}>
                + Add Member
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed rounded-lg bg-gray-50">
                <Users className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500 mb-3">No family members added yet</p>
                <Button type="button" variant="outline" size="sm" onClick={addMember}>
                  + Add Family Member
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Table Header */}
                <div className="hidden lg:grid lg:grid-cols-7 gap-3 px-3 py-2 bg-gray-100 rounded-lg text-xs font-medium text-gray-600">
                  <span>Name as per PAN</span>
                  <span>DOB</span>
                  <span>Relation</span>
                  <span>Life Exp.</span>
                  <span>Tax Regime</span>
                  <span>Tax %</span>
                  <span className="text-center">Action</span>
                </div>

                {members.map((member, index) => (
                  <div key={member.id} className="border rounded-lg p-4 bg-white">
                    <div className="lg:hidden flex justify-between items-center mb-3">
                      <Badge variant="outline">Member {index + 1}</Badge>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm"
                        onClick={() => removeMember(member.id)}
                        className="text-red-600 hover:bg-red-50"
                      >
                        Remove
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-7 gap-3 items-end">
                      {/* Name as per PAN */}
                      <div>
                        <Label className="lg:hidden text-xs">Name as per PAN *</Label>
                        <Input
                          value={member.name_as_per_pan}
                          onChange={(e) => updateMember(member.id, 'name_as_per_pan', e.target.value)}
                          placeholder="Name as per PAN"
                          className={errors[`member_${index}_name`] ? 'border-red-500' : ''}
                        />
                      </div>

                      {/* DOB */}
                      <div>
                        <Label className="lg:hidden text-xs">DOB</Label>
                        <Input
                          type="date"
                          value={member.date_of_birth}
                          onChange={(e) => updateMember(member.id, 'date_of_birth', e.target.value)}
                          max={new Date().toISOString().split('T')[0]}
                        />
                      </div>

                      {/* Relation */}
                      <div>
                        <Label className="lg:hidden text-xs">Relation</Label>
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

                      {/* Life Expectancy */}
                      <div>
                        <Label className="lg:hidden text-xs">Life Exp.</Label>
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

                      {/* Tax Regime */}
                      <div>
                        <Label className="lg:hidden text-xs">Tax Regime</Label>
                        <Select 
                          value={member.tax_regime} 
                          onValueChange={(v) => updateMember(member.id, 'tax_regime', v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TAX_REGIME_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Tax % */}
                      <div>
                        <Label className="lg:hidden text-xs">Tax %</Label>
                        <Select 
                          value={member.tax_percent} 
                          onValueChange={(v) => updateMember(member.id, 'tax_percent', v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TAX_PERCENT_OPTIONS[member.tax_regime].map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Remove Button (Desktop) */}
                      <div className="hidden lg:flex justify-center">
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm"
                          onClick={() => removeMember(member.id)}
                          className="text-red-600 hover:bg-red-50"
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={addMember}
                  className="w-full border-dashed"
                >
                  + Add Another Family Member
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 5: Next Step Selection */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <ArrowRight className="h-5 w-5 text-etihad-gold-600" />
              5. Next Step
            </CardTitle>
            <CardDescription>Choose how to proceed after creating the family</CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <Label>What would you like to do next?</Label>
              <Select value={nextStep} onValueChange={setNextStep}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NEXT_STEP_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-2">
                {nextStep === "account_opening" 
                  ? "You will be redirected to the account opening process"
                  : "You will continue adding income, goals, expenses, and other financial details"
                }
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        {(primaryHolder.name_as_per_pan || members.length > 0) && (
          <Card className="bg-gray-50 border-green-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="font-medium">Summary</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Family Name:</span>
                  <p className="font-medium">{familyName || '-'}</p>
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
                  <span className="text-gray-500">Next Step:</span>
                  <Badge variant={nextStep === "account_opening" ? "default" : "secondary"}>
                    {nextStep === "account_opening" ? "Account Opening" : "Data Gathering"}
                  </Badge>
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
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={loading || !primaryHolder.name_as_per_pan || !primaryHolder.date_of_birth}
            className="bg-etihad-gold-600 hover:bg-etihad-gold-700"
          >
            {loading ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                Creating...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {nextStep === "account_opening" ? "Create & Open Account" : "Create & Continue"}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
