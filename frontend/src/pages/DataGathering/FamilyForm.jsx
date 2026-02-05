import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Relationship options
const RELATIONSHIP_OPTIONS = [
  { value: "Self", label: "Self" },
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
const LIFE_EXPECTANCY_OPTIONS = [65, 70, 75, 80, 85, 90, 95, 100];

// Tax Slab options
const TAX_SLAB_OPTIONS = ["0%", "5%", "10%", "15%", "20%", "25%", "30%"];

// Proceed To options
const PROCEED_OPTIONS = [
  { value: "data_gathering", label: "Data Gathering" },
  { value: "account_opening", label: "Account Opening" }
];

export default function FamilyForm({ onCancel, onSubmit, user }) {
  const [loading, setLoading] = useState(false);
  const [subBrokers, setSubBrokers] = useState([]);
  const [selectedAssociate, setSelectedAssociate] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [proceedTo, setProceedTo] = useState("data_gathering");

  // Family members array - first one is always primary (Self)
  const [members, setMembers] = useState([
    {
      id: 1,
      name: "",
      dob: "",
      relation: "Self",
      life_expectancy: 85,
      tax_slab: "30%",
      isPrimary: true
    }
  ]);

  useEffect(() => {
    fetchSubBrokers();
    if (user?.role === 'sub_broker') {
      setSelectedAssociate(user.id);
    }
  }, [user]);

  // Auto-generate family name when primary holder name changes
  useEffect(() => {
    const primaryMember = members.find(m => m.isPrimary);
    if (primaryMember?.name?.trim()) {
      setFamilyName(`${primaryMember.name.trim()} & FAMILY`);
    } else {
      setFamilyName("");
    }
  }, [members]);

  const fetchSubBrokers = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/sub-brokers`, { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      const sbList = Array.isArray(response.data) ? response.data : response.data.sub_brokers || [];
      setSubBrokers(sbList);
    } catch (error) {
      console.error("Error fetching sub-brokers:", error);
    }
  };

  const updateMember = (id, field, value) => {
    setMembers(members.map(m => 
      m.id === id ? { ...m, [field]: value } : m
    ));
  };

  const addMember = () => {
    const newId = Math.max(...members.map(m => m.id)) + 1;
    setMembers([
      ...members,
      {
        id: newId,
        name: "",
        dob: "",
        relation: "Spouse",
        life_expectancy: 85,
        tax_slab: "20%",
        isPrimary: false
      }
    ]);
  };

  const removeMember = (id) => {
    setMembers(members.filter(m => m.id !== id));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const primaryMember = members.find(m => m.isPrimary);
    if (!primaryMember?.name?.trim()) {
      toast.error("Primary holder name is required");
      return;
    }
    if (!primaryMember?.dob) {
      toast.error("Primary holder date of birth is required");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      
      const payload = {
        broker_id: user?.role === 'broker' ? user.id : user?.broker_id,
        sub_broker_id: selectedAssociate || null,
        primary_holder: {
          name: primaryMember.name,
          date_of_birth: primaryMember.dob,
          relation: "Primary",
          life_expectancy: parseInt(primaryMember.life_expectancy),
          tax_slab: primaryMember.tax_slab
        },
        members: members.filter(m => !m.isPrimary).map(m => ({
          name: m.name,
          date_of_birth: m.dob,
          relation: m.relation,
          life_expectancy: parseInt(m.life_expectancy),
          tax_slab: m.tax_slab
        }))
      };

      const response = await axios.post(`${API}/data-gathering/family`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success("Family created successfully!");
      onSubmit(response.data.family, proceedTo);
    } catch (error) {
      console.error("Error creating family:", error);
      toast.error(error.response?.data?.detail || "Failed to create family");
    } finally {
      setLoading(false);
    }
  };

  // Format date for display (DD/MM/YYYY)
  const formatDateForDisplay = (dateStr) => {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Back Button */}
      <div className="mb-6">
        <Button variant="ghost" onClick={onCancel} className="gap-2 text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Introduction Section */}
        <div className="mb-8">
          <h2 className="text-xl text-gray-600 mb-4">Introduction</h2>
          <hr className="mb-6" />
          
          <div className="max-w-md">
            <div className="relative">
              <Label className="absolute -top-2 left-3 bg-white px-1 text-xs text-gray-500 z-10">
                Associate
              </Label>
              <Select value={selectedAssociate} onValueChange={setSelectedAssociate}>
                <SelectTrigger className="h-12 border-gray-300 rounded">
                  <SelectValue placeholder="Select Associate" />
                </SelectTrigger>
                <SelectContent>
                  {user?.role === 'broker' && (
                    <SelectItem value="none">None - Direct Client</SelectItem>
                  )}
                  {subBrokers.map(sb => (
                    <SelectItem key={sb.id} value={sb.id}>
                      {sb.name} {sb.employee_code ? `(${sb.employee_code})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Family Name Section */}
        <div className="mb-8">
          <hr className="mb-6" />
          <div className="max-w-lg">
            <div className="relative">
              <Label className="absolute -top-2 left-3 bg-white px-1 text-xs text-gray-500 z-10">
                Family Name
              </Label>
              <Input
                value={familyName}
                readOnly
                className="h-12 bg-gray-100 border-gray-300 rounded text-gray-700"
                placeholder="Auto-generated from primary holder name"
              />
            </div>
          </div>
        </div>

        {/* Family Details Section */}
        <div className="mb-8">
          <hr className="mb-6" />
          <h2 className="text-xl text-gray-600 mb-6">Family Details</h2>
          
          <div className="space-y-4">
            {members.map((member, index) => (
              <div key={member.id} className="flex items-end gap-3">
                {/* Name */}
                <div className="flex-1 max-w-sm relative">
                  <Label className="absolute -top-2 left-3 bg-white px-1 text-xs text-gray-500 z-10">
                    Name
                  </Label>
                  <Input
                    value={member.name}
                    onChange={(e) => updateMember(member.id, 'name', e.target.value)}
                    className="h-12 border-gray-300 rounded"
                    placeholder="Enter name"
                  />
                </div>

                {/* DOB */}
                <div className="w-36 relative">
                  <Label className="absolute -top-2 left-3 bg-white px-1 text-xs text-gray-500 z-10">
                    DOB
                  </Label>
                  <Input
                    type="date"
                    value={member.dob}
                    onChange={(e) => updateMember(member.id, 'dob', e.target.value)}
                    className="h-12 border-gray-300 rounded"
                  />
                </div>

                {/* Relation */}
                <div className="w-28 relative">
                  <Label className="absolute -top-2 left-3 bg-white px-1 text-xs text-gray-500 z-10">
                    Relation
                  </Label>
                  {member.isPrimary ? (
                    <Input
                      value="Self"
                      readOnly
                      className="h-12 bg-gray-100 border-gray-300 rounded"
                    />
                  ) : (
                    <Select 
                      value={member.relation} 
                      onValueChange={(v) => updateMember(member.id, 'relation', v)}
                    >
                      <SelectTrigger className="h-12 border-gray-300 rounded bg-gray-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RELATIONSHIP_OPTIONS.filter(r => r.value !== 'Self').map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Life Expectancy */}
                <div className="w-32 relative">
                  <Label className="absolute -top-2 left-3 bg-white px-1 text-xs text-gray-500 z-10">
                    Life Expectancy
                  </Label>
                  <Input
                    type="number"
                    value={member.life_expectancy}
                    onChange={(e) => updateMember(member.id, 'life_expectancy', e.target.value)}
                    className="h-12 border-gray-300 rounded"
                    min={50}
                    max={120}
                  />
                </div>

                {/* Tax Slab */}
                <div className="w-24 relative">
                  <Label className="absolute -top-2 left-3 bg-white px-1 text-xs text-gray-500 z-10">
                    Tax Slab
                  </Label>
                  <Select 
                    value={member.tax_slab} 
                    onValueChange={(v) => updateMember(member.id, 'tax_slab', v)}
                  >
                    <SelectTrigger className="h-12 border-gray-300 rounded">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TAX_SLAB_OPTIONS.map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Delete Button - only for non-primary members */}
                <div className="w-10">
                  {!member.isPrimary && (
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon"
                      onClick={() => removeMember(member.id)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Add New Member Button */}
          <div className="flex justify-center mt-6">
            <Button 
              type="button" 
              onClick={addMember}
              className="bg-blue-500 hover:bg-blue-600 text-white px-8"
            >
              Add New Member
            </Button>
          </div>
        </div>

        {/* Proceed To Section */}
        <div className="mb-8">
          <hr className="mb-6" />
          <h2 className="text-xl text-gray-600 mb-4">Proceed To</h2>
          
          <div className="max-w-xs">
            <Select value={proceedTo} onValueChange={setProceedTo}>
              <SelectTrigger className="h-12 border-gray-300 rounded">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROCEED_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Save and Next Button */}
        <div className="flex justify-center mt-8">
          <Button 
            type="submit" 
            disabled={loading}
            className="bg-blue-500 hover:bg-blue-600 text-white px-12 py-3 text-base"
          >
            {loading ? "Saving..." : "Save and Next"}
          </Button>
        </div>
      </form>
    </div>
  );
}
