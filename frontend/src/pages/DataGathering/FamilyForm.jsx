import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Save, User, Users } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function FamilyForm({ onCancel, onSubmit, user, editFamily = null }) {
  const [loading, setLoading] = useState(false);
  const [lookups, setLookups] = useState({
    lifeExpectancy: [],
    taxSlabs: [],
    relations: []
  });

  // Form state
  const [brokerId, setBrokerId] = useState("");
  const [subBrokerId, setSubBrokerId] = useState("");
  const [brokers, setBrokers] = useState([]);
  const [subBrokers, setSubBrokers] = useState([]);

  const [primaryHolder, setPrimaryHolder] = useState({
    name: "",
    date_of_birth: "",
    life_expectancy: 80,
    tax_slab: "30%"
  });

  const [members, setMembers] = useState([]);

  useEffect(() => {
    fetchLookups();
    fetchUsers();
    
    // Set defaults based on user role
    if (user?.role === 'broker') {
      setBrokerId(user.id);
    } else if (user?.role === 'sub_broker') {
      setSubBrokerId(user.id);
    }
  }, [user]);

  const fetchLookups = async () => {
    try {
      const token = localStorage.getItem("token");
      const [lifeExp, taxSlabs, relations] = await Promise.all([
        axios.get(`${API}/data-gathering/lookup/life-expectancy`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/data-gathering/lookup/tax-slabs`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/data-gathering/lookup/relations`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      
      setLookups({
        lifeExpectancy: lifeExp.data.options || [],
        taxSlabs: taxSlabs.data.options || [],
        relations: relations.data.options || []
      });
    } catch (error) {
      console.error("Error fetching lookups:", error);
    }
  };

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("token");
      
      // Fetch brokers (only one expected)
      const brokersRes = await axios.get(`${API}/users?role=broker`, { 
        headers: { Authorization: `Bearer ${token}` } 
      }).catch(() => ({ data: { users: [] } }));
      
      // Fetch sub-brokers
      const subBrokersRes = await axios.get(`${API}/sub-brokers`, { 
        headers: { Authorization: `Bearer ${token}` } 
      }).catch(() => ({ data: [] }));
      
      setBrokers(brokersRes.data.users || [brokersRes.data] || []);
      setSubBrokers(Array.isArray(subBrokersRes.data) ? subBrokersRes.data : subBrokersRes.data.sub_brokers || []);
      
      // Auto-select broker if only one
      if (brokersRes.data.users?.length === 1 || brokersRes.data.id) {
        setBrokerId(brokersRes.data.users?.[0]?.id || brokersRes.data.id || user?.id);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const addMember = () => {
    setMembers([
      ...members,
      {
        id: Date.now(),
        name: "",
        date_of_birth: "",
        relation: "Spouse",
        life_expectancy: 80,
        tax_slab: "30%"
      }
    ]);
  };

  const removeMember = (id) => {
    setMembers(members.filter(m => m.id !== id));
  };

  const updateMember = (id, field, value) => {
    setMembers(members.map(m => 
      m.id === id ? { ...m, [field]: value } : m
    ));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!primaryHolder.name.trim()) {
      toast.error("Primary holder name is required");
      return;
    }
    if (!primaryHolder.date_of_birth) {
      toast.error("Primary holder date of birth is required");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      
      const payload = {
        broker_id: brokerId || user?.id,
        sub_broker_id: subBrokerId || null,
        primary_holder: {
          name: primaryHolder.name,
          date_of_birth: primaryHolder.date_of_birth,
          relation: "Primary",
          life_expectancy: parseInt(primaryHolder.life_expectancy),
          tax_slab: primaryHolder.tax_slab
        },
        members: members.map(m => ({
          name: m.name,
          date_of_birth: m.date_of_birth,
          relation: m.relation,
          life_expectancy: parseInt(m.life_expectancy),
          tax_slab: m.tax_slab
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

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create New Family</h1>
          <p className="text-sm text-gray-500">Add family members for financial planning</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Introduction Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Introduction</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Broker</Label>
                <Input
                  value={user?.role === 'broker' ? user?.name : (brokers.find(b => b.id === brokerId)?.name || 'Broker')}
                  disabled
                  className="bg-gray-50"
                />
                <p className="text-xs text-gray-500 mt-1">Read-only</p>
              </div>
              <div>
                <Label>Sub-Broker</Label>
                {user?.role === 'broker' ? (
                  <Select value={subBrokerId} onValueChange={setSubBrokerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select sub-broker (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {subBrokers.map(sb => (
                        <SelectItem key={sb.id} value={sb.id}>{sb.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={user?.name || ''}
                    disabled
                    className="bg-gray-50"
                  />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Primary Holder Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5 text-etihad-gold-600" />
              Primary Holder
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <Label>Full Name *</Label>
                <Input
                  value={primaryHolder.name}
                  onChange={(e) => setPrimaryHolder({ ...primaryHolder, name: e.target.value })}
                  placeholder="Enter full name"
                  required
                />
              </div>
              <div>
                <Label>Date of Birth *</Label>
                <Input
                  type="date"
                  value={primaryHolder.date_of_birth}
                  onChange={(e) => setPrimaryHolder({ ...primaryHolder, date_of_birth: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Relation</Label>
                <Input value="Primary" disabled className="bg-gray-50" />
              </div>
              <div>
                <Label>Life Expectancy</Label>
                <Select 
                  value={String(primaryHolder.life_expectancy)} 
                  onValueChange={(v) => setPrimaryHolder({ ...primaryHolder, life_expectancy: parseInt(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {lookups.lifeExpectancy.map(opt => (
                      <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tax Slab</Label>
                <Select 
                  value={primaryHolder.tax_slab} 
                  onValueChange={(v) => setPrimaryHolder({ ...primaryHolder, tax_slab: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {lookups.taxSlabs.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Other Family Members */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-etihad-gold-600" />
                Other Family Members
              </CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addMember}>
                <Plus className="h-4 w-4 mr-2" />
                Add Member
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Users className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                <p>No additional members added yet</p>
                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={addMember}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Family Member
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {members.map((member, index) => (
                  <div key={member.id} className="p-4 border rounded-lg bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-700">Member {index + 1}</span>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm"
                        onClick={() => removeMember(member.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                      <div className="lg:col-span-2">
                        <Label>Full Name</Label>
                        <Input
                          value={member.name}
                          onChange={(e) => updateMember(member.id, 'name', e.target.value)}
                          placeholder="Enter name"
                        />
                      </div>
                      <div>
                        <Label>Date of Birth</Label>
                        <Input
                          type="date"
                          value={member.date_of_birth}
                          onChange={(e) => updateMember(member.id, 'date_of_birth', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Relation</Label>
                        <Select 
                          value={member.relation} 
                          onValueChange={(v) => updateMember(member.id, 'relation', v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {lookups.relations.filter(r => r.value !== 'Primary').map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Life Expectancy</Label>
                        <Select 
                          value={String(member.life_expectancy)} 
                          onValueChange={(v) => updateMember(member.id, 'life_expectancy', parseInt(v))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {lookups.lifeExpectancy.map(opt => (
                              <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Tax Slab</Label>
                        <Select 
                          value={member.tax_slab} 
                          onValueChange={(v) => updateMember(member.id, 'tax_slab', v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {lookups.taxSlabs.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading} className="bg-etihad-gold-600 hover:bg-etihad-gold-700">
            {loading ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                Creating...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Create Family
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
