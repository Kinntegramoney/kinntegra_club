import React, { useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Edit, Trash2, User, Save } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const RELATIONS = [
  { value: "Spouse", label: "Spouse" },
  { value: "Son", label: "Son" },
  { value: "Daughter", label: "Daughter" },
  { value: "Father", label: "Father" },
  { value: "Mother", label: "Mother" },
  { value: "Brother", label: "Brother" },
  { value: "Sister", label: "Sister" },
  { value: "Other", label: "Other" }
];

const LIFE_EXPECTANCY = [70, 75, 80, 85, 90, 95, 100];
const TAX_SLABS = ["0%", "5%", "10%", "15%", "20%", "25%", "30%", "surcharge"];

export default function MembersSection({ family, onUpdate, isReadOnly, onRefresh }) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editMember, setEditMember] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    date_of_birth: "",
    relation: "Spouse",
    life_expectancy: 80,
    tax_slab: "30%"
  });

  const resetForm = () => {
    setFormData({
      name: "",
      date_of_birth: "",
      relation: "Spouse",
      life_expectancy: 80,
      tax_slab: "30%"
    });
    setEditMember(null);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error("Name is required");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      
      if (editMember) {
        // Update existing member
        await axios.put(
          `${API}/data-gathering/family/${family.id}/member/${editMember.id}`,
          formData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success("Member updated");
      } else {
        // Add new member
        await axios.put(
          `${API}/data-gathering/family/${family.id}/member`,
          formData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success("Member added");
      }
      
      setShowAddDialog(false);
      resetForm();
      onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save member");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (memberId) => {
    if (!window.confirm("Are you sure you want to delete this member?")) return;
    
    try {
      const token = localStorage.getItem("token");
      await axios.delete(
        `${API}/data-gathering/family/${family.id}/member/${memberId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Member deleted");
      onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete member");
    }
  };

  const openEditDialog = (member) => {
    setFormData({
      name: member.name,
      date_of_birth: member.date_of_birth,
      relation: member.relation,
      life_expectancy: member.life_expectancy,
      tax_slab: member.tax_slab
    });
    setEditMember(member);
    setShowAddDialog(true);
  };

  const members = family.members || [];
  const primaryMember = members.find(m => m.is_primary);
  const otherMembers = members.filter(m => !m.is_primary);

  const calculateAge = (dob) => {
    if (!dob) return "-";
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
    <div className="space-y-6">
      {/* Primary Holder */}
      {primaryMember && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5 text-etihad-gold-600" />
              Primary Holder
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-etihad-gold-100 flex items-center justify-center">
                  <span className="text-xl font-semibold text-etihad-gold-600">
                    {primaryMember.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{primaryMember.name}</h3>
                  <p className="text-sm text-gray-500">
                    Age: {calculateAge(primaryMember.date_of_birth)} years • 
                    DOB: {primaryMember.date_of_birth ? format(new Date(primaryMember.date_of_birth), "MMM d, yyyy") : "Not set"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <Badge variant="outline">Life Exp: {primaryMember.life_expectancy} yrs</Badge>
                  <Badge variant="outline" className="ml-2">Tax: {primaryMember.tax_slab}</Badge>
                </div>
                {!isReadOnly && (
                  <Button variant="outline" size="sm" onClick={() => openEditDialog(primaryMember)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Other Members */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Family Members ({otherMembers.length})</CardTitle>
            {!isReadOnly && (
              <Dialog open={showAddDialog} onOpenChange={(open) => {
                setShowAddDialog(open);
                if (!open) resetForm();
              }}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Member
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editMember ? "Edit Member" : "Add Family Member"}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label>Full Name *</Label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Enter name"
                      />
                    </div>
                    <div>
                      <Label>Date of Birth</Label>
                      <Input
                        type="date"
                        value={formData.date_of_birth}
                        onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Relation</Label>
                      <Select 
                        value={formData.relation} 
                        onValueChange={(v) => setFormData({ ...formData, relation: v })}
                        disabled={editMember?.is_primary}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RELATIONS.map(r => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Life Expectancy</Label>
                        <Select 
                          value={String(formData.life_expectancy)} 
                          onValueChange={(v) => setFormData({ ...formData, life_expectancy: parseInt(v) })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LIFE_EXPECTANCY.map(le => (
                              <SelectItem key={le} value={String(le)}>{le} years</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Tax Slab</Label>
                        <Select 
                          value={formData.tax_slab} 
                          onValueChange={(v) => setFormData({ ...formData, tax_slab: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TAX_SLABS.map(ts => (
                              <SelectItem key={ts} value={ts}>{ts === 'surcharge' ? '30% + Surcharge' : ts}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                      <Button variant="outline" onClick={() => {
                        setShowAddDialog(false);
                        resetForm();
                      }}>
                        Cancel
                      </Button>
                      <Button onClick={handleSubmit} disabled={loading}>
                        {loading ? "Saving..." : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            {editMember ? "Update" : "Add"}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {otherMembers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <User className="h-10 w-10 mx-auto text-gray-300 mb-3" />
              <p>No additional members added</p>
            </div>
          ) : (
            <div className="space-y-3">
              {otherMembers.map((member) => (
                <div 
                  key={member.id} 
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                      <span className="text-sm font-medium text-gray-600">
                        {member.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <h4 className="font-medium">{member.name}</h4>
                      <p className="text-xs text-gray-500">
                        {member.relation} • Age: {calculateAge(member.date_of_birth)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">LE: {member.life_expectancy}</Badge>
                    <Badge variant="outline" className="text-xs">Tax: {member.tax_slab}</Badge>
                    {!isReadOnly && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(member)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-red-600"
                          onClick={() => handleDelete(member.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
