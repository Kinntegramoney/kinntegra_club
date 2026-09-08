import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Trash2, Users, UserPlus, ClipboardList, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

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

const LIFE_EXPECTANCY_OPTIONS = [65, 70, 75, 80, 85, 90, 95, 100];
const TAX_SLAB_OPTIONS = ["0%", "5%", "10%", "15%", "20%", "25%", "30%"];

const PROCEED_OPTIONS = [
  { value: "data_gathering", label: "Data Gathering" }
];

export default function FamilyForm({ onCancel, onSubmit, user }) {
  const [loading, setLoading] = useState(false);
  const [subBrokers, setSubBrokers] = useState([]);
  const [selectedAssociate, setSelectedAssociate] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [proceedTo, setProceedTo] = useState("data_gathering");

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

  useEffect(() => {
    const primaryMember = members.find(m => m.isPrimary);
    if (primaryMember?.name?.trim()) {
      setFamilyName(`${primaryMember.name.trim()} & Family`);
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
    setMembers(members.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const addMember = () => {
    const newId = Math.max(...members.map(m => m.id)) + 1;
    setMembers([...members, {
      id: newId,
      name: "",
      dob: "",
      relation: "Spouse",
      life_expectancy: 85,
      tax_slab: "20%",
      isPrimary: false
    }]);
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

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onCancel} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-etihad-gold-100 rounded-lg">
              <ClipboardList className="h-5 w-5 text-etihad-gold-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">New Family</h1>
              <p className="text-sm text-gray-500">Create a family profile for financial planning</p>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Introduction Card */}
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Introduction</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm text-gray-600">Broker</Label>
              <Input
                value={user?.role === 'broker' ? user?.name : 'Assigned Broker'}
                disabled
                className="mt-1 bg-gray-50"
              />
            </div>
            <div>
              <Label className="text-sm text-gray-600">Associate</Label>
              <Select value={selectedAssociate} onValueChange={setSelectedAssociate}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select Associate" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None - Direct Client</SelectItem>
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

        {/* Family Name Card */}
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Family Name</h2>
          <div className="max-w-md">
            <Input
              value={familyName}
              readOnly
              className="bg-gray-50 text-gray-700"
              placeholder="Auto-generated from primary holder name"
            />
            <p className="text-xs text-gray-500 mt-1">Auto-populated based on primary holder</p>
          </div>
        </div>

        {/* Family Details Card */}
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-etihad-gold-600" />
              <h2 className="text-base font-semibold text-gray-800">Family Details</h2>
            </div>
            <Button 
              type="button" 
              variant="outline" 
              size="sm"
              onClick={addMember}
              className="gap-1"
            >
              <UserPlus className="h-4 w-4" />
              Add Member
            </Button>
          </div>

          {/* Table Header */}
          <div className="hidden md:grid md:grid-cols-6 gap-3 px-3 py-2 bg-gray-50 rounded-lg text-xs font-medium text-gray-500 mb-3">
            <span>Name</span>
            <span>DOB</span>
            <span>Relation</span>
            <span>Life Expectancy</span>
            <span>Tax Slab</span>
            <span className="text-center">Action</span>
          </div>

          {/* Members List */}
          <div className="space-y-3">
            {members.map((member) => (
              <div key={member.id} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-center p-3 border rounded-lg bg-gray-50/50">
                <div>
                  <Label className="md:hidden text-xs text-gray-500 mb-1">Name</Label>
                  <Input
                    value={member.name}
                    onChange={(e) => updateMember(member.id, 'name', e.target.value)}
                    placeholder="Enter name"
                    className="bg-white"
                  />
                </div>
                <div>
                  <Label className="md:hidden text-xs text-gray-500 mb-1">DOB</Label>
                  <Input
                    type="date"
                    value={member.dob}
                    onChange={(e) => updateMember(member.id, 'dob', e.target.value)}
                    className="bg-white"
                  />
                </div>
                <div>
                  <Label className="md:hidden text-xs text-gray-500 mb-1">Relation</Label>
                  {member.isPrimary ? (
                    <Input value="Self" readOnly className="bg-gray-100" />
                  ) : (
                    <Select value={member.relation} onValueChange={(v) => updateMember(member.id, 'relation', v)}>
                      <SelectTrigger className="bg-white">
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
                <div>
                  <Label className="md:hidden text-xs text-gray-500 mb-1">Life Expectancy</Label>
                  <Select value={String(member.life_expectancy)} onValueChange={(v) => updateMember(member.id, 'life_expectancy', v)}>
                    <SelectTrigger className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LIFE_EXPECTANCY_OPTIONS.map(opt => (
                        <SelectItem key={opt} value={String(opt)}>{opt} yrs</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="md:hidden text-xs text-gray-500 mb-1">Tax Slab</Label>
                  <Select value={member.tax_slab} onValueChange={(v) => updateMember(member.id, 'tax_slab', v)}>
                    <SelectTrigger className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TAX_SLAB_OPTIONS.map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-center">
                  {!member.isPrimary ? (
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon"
                      onClick={() => removeMember(member.id)}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : (
                    <span className="text-xs text-gray-400">Primary</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Proceed To Card */}
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center gap-2 mb-4">
            <ArrowRight className="h-5 w-5 text-etihad-gold-600" />
            <h2 className="text-base font-semibold text-gray-800">Proceed To</h2>
          </div>
          <div className="max-w-xs">
            <Select value={proceedTo} onValueChange={setProceedTo}>
              <SelectTrigger>
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

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={loading}
            className="bg-etihad-gold-600 hover:bg-etihad-gold-700 text-white px-6"
          >
            {loading ? "Saving..." : "Save and Next"}
          </Button>
        </div>
      </form>
    </div>
  );
}
