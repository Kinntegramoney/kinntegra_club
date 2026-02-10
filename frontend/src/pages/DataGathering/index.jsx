import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { 
  RefreshCw, Users, DollarSign, Target, Receipt, Shield, 
  CreditCard, TrendingUp, Trash2, UserPlus, ClipboardList,
  Plus, Search, ChevronRight, Eye, Lightbulb, CheckCircle2, Landmark, PieChart, BarChart3
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

// Import section components
import IncomeSection from "./sections/IncomeSection";
import GoalSection from "./sections/GoalSection";
import ExpenseSection from "./sections/ExpenseSection";
import InsuranceSection from "./sections/InsuranceSection";
import LiabilitySection from "./sections/LiabilitySection";
import SurplusSection from "./sections/SurplusSection";
import AssetsSection from "./sections/AssetsSection";
import NetworthSection from "./sections/NetworthSection";
import InvestmentSection from "./sections/InvestmentSection";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Tab configuration - Order: Members, Income, Expenses, Investments, Goals, Surplus, Insurance, Assets, Liabilities, Networth
const TABS = [
  { id: "introduction", label: "Members", icon: Users },
  { id: "income", label: "Income", icon: DollarSign },
  { id: "expenses", label: "Expenses", icon: Receipt },
  { id: "investments", label: "Investments", icon: BarChart3 },
  { id: "goals", label: "Goals", icon: Target },
  { id: "surplus", label: "Surplus", icon: TrendingUp },
  { id: "insurance", label: "Insurance", icon: Shield },
  { id: "assets", label: "Assets", icon: Landmark },
  { id: "liability", label: "Liabilities", icon: CreditCard },
  { id: "networth", label: "Networth", icon: PieChart }
];

// Form options
const RELATIONSHIP_OPTIONS = ["Self", "Spouse", "Son", "Daughter", "Father", "Mother", "Brother", "Sister", "Other"];
const LIFE_EXPECTANCY_OPTIONS = [65, 70, 75, 80, 85, 90, 95, 100];
const TAX_REGIME_OPTIONS = ["Old Regime", "New Regime", "NA"];
const TAX_STATUS_OPTIONS = ["Resident", "NRI with Indian Passport", "NRI with Foreign Passport", "Foreign Passport"];
const TAX_SLAB_OPTIONS = ["0%", "5%", "10%", "15%", "20%", "25%", "30%"];
const PROCEED_OPTIONS = ["Data Gathering", "Proceed to Account Opening"];

export default function DataGathering() {
  const navigate = useNavigate();
  const { familyId } = useParams();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [families, setFamilies] = useState([]);
  const [selectedFamily, setSelectedFamily] = useState(null);
  const [activeTab, setActiveTab] = useState("introduction");
  const [searchTerm, setSearchTerm] = useState("");
  
  // Form states
  const [subBrokers, setSubBrokers] = useState([]);
  const [selectedSubBroker, setSelectedSubBroker] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [proceedOption, setProceedOption] = useState("");
  const [members, setMembers] = useState([
    { id: 1, name: "", dob: "", relation: "Self", life_expectancy: "", tax_regime: "", tax_status: "", tax_slab: "", isPrimary: true }
  ]);
  const [saving, setSaving] = useState(false);
  const [showWhyModal, setShowWhyModal] = useState(false);

  useEffect(() => {
    document.title = "Kinntegraa | Data Gathering";
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    setUser(JSON.parse(userData));
    fetchData();
  }, [navigate]);

  useEffect(() => {
    if (familyId && families.length > 0) {
      const family = families.find(f => f.id === familyId);
      if (family) {
        setSelectedFamily(family);
        loadFamilyData(family);
      }
    }
  }, [familyId, families]);

  useEffect(() => {
    const primaryMember = members.find(m => m.isPrimary);
    if (primaryMember?.name?.trim()) {
      setFamilyName(`${primaryMember.name.trim()} & Family`);
    } else {
      setFamilyName("");
    }
  }, [members]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const [familiesRes, subBrokersRes] = await Promise.all([
        axios.get(`${API}/data-gathering/families`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/data-gathering/lookup/sub-brokers`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: { sub_brokers: [] } }))
      ]);
      setFamilies(familiesRes.data.families || []);
      setSubBrokers(subBrokersRes.data.sub_brokers || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const loadFamilyData = (family) => {
    setSelectedSubBroker(family.sub_broker_id || "");
    setFamilyName(family.family_name || "");
    setProceedOption(family.proceed_option || "");
    const loadedMembers = family.members?.map((m, idx) => ({
      id: m.id || idx + 1,
      name: m.name || "",
      dob: m.date_of_birth || "",
      relation: m.relation === "Primary" ? "Self" : m.relation,
      life_expectancy: m.life_expectancy ? String(m.life_expectancy) : "",
      tax_regime: m.tax_regime || "",
      tax_status: m.tax_status || "",
      tax_slab: m.tax_slab || "",
      isPrimary: m.is_primary || idx === 0
    })) || [{ id: 1, name: "", dob: "", relation: "Self", life_expectancy: "", tax_regime: "", tax_status: "", tax_slab: "", isPrimary: true }];
    setMembers(loadedMembers);
  };

  const refreshSelectedFamily = async () => {
    if (!selectedFamily?.id) return;
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/data-gathering/family/${selectedFamily.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedFamily(response.data);
      loadFamilyData(response.data);
      // Update in families list
      setFamilies(prev => prev.map(f => f.id === response.data.id ? response.data : f));
    } catch (error) {
      console.error("Error refreshing family:", error);
    }
  };

  const handleDataUpdate = (section, data) => {
    if (!selectedFamily) return;
    const updatedFamily = { ...selectedFamily, [section]: data };
    setSelectedFamily(updatedFamily);
    setFamilies(prev => prev.map(f => f.id === updatedFamily.id ? updatedFamily : f));
  };

  const updateMember = (id, field, value) => {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const updateMemberMultiple = (id, updates) => {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const addMember = () => {
    const newId = Math.max(...members.map(m => m.id)) + 1;
    setMembers([...members, {
      id: newId, name: "", dob: "", relation: "", life_expectancy: "", tax_regime: "", tax_status: "", tax_slab: "", isPrimary: false
    }]);
  };

  const removeMember = (id) => {
    setMembers(members.filter(m => m.id !== id));
  };

  const setPrimaryMember = (id) => {
    setMembers(members.map(m => ({
      ...m,
      isPrimary: m.id === id,
      relation: m.id === id ? "Self" : (m.relation === "Self" ? "Spouse" : m.relation)
    })));
  };

  const handleSave = async () => {
    const primaryMember = members.find(m => m.isPrimary);
    if (!primaryMember?.name?.trim()) {
      toast.error("Primary holder name is required");
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      const payload = {
        broker_id: user?.role === 'broker' ? user.id : user?.broker_id,
        sub_broker_id: selectedSubBroker || null,
        proceed_option: proceedOption,
        primary_holder: {
          name: primaryMember.name,
          date_of_birth: primaryMember.dob,
          relation: "Primary",
          life_expectancy: parseInt(primaryMember.life_expectancy) || 85,
          tax_regime: primaryMember.tax_regime,
          tax_status: primaryMember.tax_status,
          tax_slab: primaryMember.tax_slab
        },
        members: members.filter(m => !m.isPrimary).map(m => ({
          name: m.name, date_of_birth: m.dob, relation: m.relation,
          life_expectancy: parseInt(m.life_expectancy) || 85, 
          tax_regime: m.tax_regime, tax_status: m.tax_status, tax_slab: m.tax_slab
        }))
      };

      let savedFamily;
      if (selectedFamily) {
        // Update existing family
        const response = await axios.put(`${API}/data-gathering/family/${selectedFamily.id}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        savedFamily = response.data.family;
        // Update family in the list
        setFamilies(prev => prev.map(f => f.id === savedFamily.id ? savedFamily : f));
        setSelectedFamily(savedFamily);
        setFamilyName(savedFamily.family_name);
        toast.success("Family updated successfully!");
      } else {
        const response = await axios.post(`${API}/data-gathering/family`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        savedFamily = response.data.family;
        setFamilies(prev => [savedFamily, ...prev]);
        setSelectedFamily(savedFamily);
        setFamilyName(savedFamily.family_name);
        toast.success("Family created successfully!");
      }
      
      // Show "Why do this exercise" modal only on Introduction tab
      if (activeTab === "introduction") {
        setShowWhyModal(true);
      } else {
        // Move to next tab for other tabs (matches TABS order)
        const tabOrder = ["introduction", "income", "expenses", "investments", "goals", "surplus", "insurance", "assets", "liability", "networth"];
        const currentIndex = tabOrder.indexOf(activeTab);
        if (currentIndex < tabOrder.length - 1) {
          setActiveTab(tabOrder[currentIndex + 1]);
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleStartDataGathering = () => {
    setShowWhyModal(false);
    setActiveTab("income");
  };

  const handleSelectFamily = (family) => {
    setSelectedFamily(family);
    loadFamilyData(family);
    const basePath = user?.role === 'broker' ? '/broker' : '/sub-broker';
    navigate(`${basePath}/data-gathering/${family.id}`);
  };

  const handleNewFamily = () => {
    setSelectedFamily(null);
    setSelectedSubBroker("");
    setFamilyName("");
    setProceedOption("");
    setMembers([{ id: 1, name: "", dob: "", relation: "Self", life_expectancy: "", tax_regime: "", tax_status: "", tax_slab: "", isPrimary: true }]);
    setActiveTab("introduction");
  };

  const filteredFamilies = families.filter(f => 
    f.family_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getSidebar = () => {
    if (user?.role === "broker") return <Sidebar user={user} />;
    if (user?.role === "sub_broker") return <SubBrokerSidebar user={user} />;
    return null;
  };

  // Render tab content
  const renderTabContent = () => {
    const isReadOnly = user?.role === 'client';
    
    // For tabs other than introduction, require a selected family
    if (activeTab !== "introduction" && !selectedFamily) {
      return (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-4">
            <ClipboardList className="h-8 w-8 text-amber-600" />
          </div>
          <h3 className="text-lg font-medium text-gray-700 mb-2">No Family Selected</h3>
          <p className="text-gray-500 text-center max-w-md">
            Please select an existing family from the list or create a new one in the Introduction tab first.
          </p>
        </div>
      );
    }
    
    switch (activeTab) {
      case "introduction":
        return renderIntroductionTab();
      case "income":
        return (
          <IncomeSection 
            family={selectedFamily} 
            onUpdate={(data) => handleDataUpdate('income_details', data)}
            isReadOnly={isReadOnly}
            onRefresh={refreshSelectedFamily}
          />
        );
      case "goals":
        return (
          <GoalSection 
            family={selectedFamily} 
            onUpdate={(data) => handleDataUpdate('goal_details', data)}
            isReadOnly={isReadOnly}
            onRefresh={refreshSelectedFamily}
          />
        );
      case "expenses":
        return (
          <ExpenseSection 
            family={selectedFamily} 
            onUpdate={(data) => handleDataUpdate('expense_details', data)}
            isReadOnly={isReadOnly}
            onRefresh={refreshSelectedFamily}
          />
        );
      case "investments":
        return (
          <InvestmentSection 
            family={selectedFamily} 
            onUpdate={(data) => handleDataUpdate('investment_details', data)}
            isReadOnly={isReadOnly}
            onRefresh={refreshSelectedFamily}
          />
        );
      case "assets":
        return (
          <AssetsSection 
            family={selectedFamily} 
            onUpdate={(data) => handleDataUpdate('asset_details', data)}
            isReadOnly={isReadOnly}
            onRefresh={refreshSelectedFamily}
          />
        );
      case "liability":
        return (
          <LiabilitySection 
            family={selectedFamily} 
            onUpdate={(data) => handleDataUpdate('liabilities', data)}
            isReadOnly={isReadOnly}
            onRefresh={refreshSelectedFamily}
          />
        );
      case "insurance":
        return (
          <InsuranceSection 
            family={selectedFamily} 
            onUpdate={(data) => handleDataUpdate('insurance_premiums', data)}
            isReadOnly={isReadOnly}
            onRefresh={refreshSelectedFamily}
          />
        );
      case "surplus":
        return (
          <SurplusSection 
            family={selectedFamily}
            isReadOnly={isReadOnly}
          />
        );
      case "networth":
        return (
          <NetworthSection 
            family={selectedFamily}
            isReadOnly={isReadOnly}
          />
        );
      default:
        return null;
    }
  };

  const renderIntroductionTab = () => (
    <div className="space-y-6">
      {/* Sub Broker & Family Name - Stacked */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <Label className="text-sm text-gray-600 mb-2 block">Sub Broker</Label>
            <Select value={selectedSubBroker} onValueChange={setSelectedSubBroker}>
              <SelectTrigger>
                <SelectValue placeholder="Select Sub Broker" />
              </SelectTrigger>
              <SelectContent>
                {subBrokers.map(sb => (
                  <SelectItem key={sb.id} value={sb.id}>
                    {sb.name} {sb.employee_code ? `(${sb.employee_code})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm text-gray-600 mb-2 block">Family Name</Label>
            <Input value={familyName} readOnly className="bg-gray-50" placeholder="Auto-generated from primary holder" />
          </div>
        </div>
      </div>

      {/* Family Members Table */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <Label className="text-sm font-medium text-gray-700">Family Members</Label>
          <Button type="button" variant="outline" size="sm" onClick={addMember} className="gap-1">
            <UserPlus className="h-4 w-4" />
            Add Member
          </Button>
        </div>

        <div className="border rounded-lg overflow-hidden">
          {/* Table Header */}
          <div className="hidden lg:grid lg:grid-cols-9 gap-2 px-4 py-3 bg-gray-50 text-xs font-medium text-gray-500 border-b">
            <span>Name</span>
            <span>DOB</span>
            <span>Relation</span>
            <span>Life Exp.</span>
            <span>Tax Status</span>
            <span>Tax Regime</span>
            <span>Tax Slab</span>
            <span className="text-center">Primary</span>
            <span className="text-center">Action</span>
          </div>

          {/* Table Body */}
          <div className="divide-y">
            {members.map((member) => {
              const isForeignPassport = member.tax_status === "Foreign Passport" || member.tax_status === "NRI with Foreign Passport";
              return (
              <div key={member.id} className="grid grid-cols-1 lg:grid-cols-9 gap-2 px-4 py-3 items-center">
                <div>
                  <Label className="lg:hidden text-xs text-gray-500 mb-1">Name</Label>
                  <Input
                    value={member.name}
                    onChange={(e) => updateMember(member.id, 'name', e.target.value)}
                    placeholder="Enter name"
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="lg:hidden text-xs text-gray-500 mb-1">DOB</Label>
                  <Input
                    type="date"
                    value={member.dob}
                    onChange={(e) => updateMember(member.id, 'dob', e.target.value)}
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="lg:hidden text-xs text-gray-500 mb-1">Relation</Label>
                  {member.isPrimary ? (
                    <Input value="Self" readOnly className="h-9 bg-gray-50" />
                  ) : (
                    <Select value={member.relation} onValueChange={(v) => updateMember(member.id, 'relation', v)}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {RELATIONSHIP_OPTIONS.filter(r => r !== 'Self').map(opt => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div>
                  <Label className="lg:hidden text-xs text-gray-500 mb-1">Life Expectancy</Label>
                  <Input
                    type="number"
                    value={member.life_expectancy}
                    onChange={(e) => updateMember(member.id, 'life_expectancy', e.target.value)}
                    placeholder="Years"
                    className="h-9"
                    min="50"
                    max="120"
                  />
                </div>
                <div>
                  <Label className="lg:hidden text-xs text-gray-500 mb-1">Tax Status</Label>
                  <Select 
                    value={member.tax_status} 
                    onValueChange={(v) => {
                      if (v === "Foreign Passport" || v === "NRI with Foreign Passport") {
                        updateMemberMultiple(member.id, { 
                          tax_status: v, 
                          tax_regime: 'NA', 
                          tax_slab: '0%' 
                        });
                      } else {
                        updateMember(member.id, 'tax_status', v);
                      }
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {TAX_STATUS_OPTIONS.map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="lg:hidden text-xs text-gray-500 mb-1">Tax Regime</Label>
                  <Select 
                    value={isForeignPassport ? "NA" : member.tax_regime} 
                    onValueChange={(v) => updateMember(member.id, 'tax_regime', v)}
                    disabled={isForeignPassport}
                  >
                    <SelectTrigger className={`h-9 ${isForeignPassport ? 'bg-gray-100' : ''}`}>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {TAX_REGIME_OPTIONS.map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="lg:hidden text-xs text-gray-500 mb-1">Tax Slab</Label>
                  <Select 
                    value={isForeignPassport ? "0%" : member.tax_slab} 
                    onValueChange={(v) => updateMember(member.id, 'tax_slab', v)}
                    disabled={isForeignPassport}
                  >
                    <SelectTrigger className={`h-9 ${isForeignPassport ? 'bg-gray-100' : ''}`}>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {TAX_SLAB_OPTIONS.map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-center">
                  <Label className="lg:hidden text-xs text-gray-500 mb-1 mr-2">Primary</Label>
                  <input
                    type="radio"
                    name="primaryMember"
                    checked={member.isPrimary}
                    onChange={() => setPrimaryMember(member.id)}
                    className="h-4 w-4 text-etihad-gold-600 cursor-pointer"
                  />
                </div>
                <div className="flex justify-center">
                  {!member.isPrimary && (
                    <Button variant="ghost" size="icon" onClick={() => removeMember(member.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 w-8">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Next Step & Save - At Bottom */}
      <div className="flex items-center justify-between pt-4 border-t">
        <div className="flex items-center gap-4">
          <Label className="text-sm text-gray-600">Next Step:</Label>
          <Select value={proceedOption} onValueChange={setProceedOption}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select next step" />
            </SelectTrigger>
            <SelectContent>
              {PROCEED_OPTIONS.map(opt => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-etihad-gold-600 hover:bg-etihad-gold-700 text-white px-8">
          {saving ? "Saving..." : (selectedFamily ? "Update & Next" : "Save & Next")}
        </Button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        {getSidebar()}
        <main className="flex-1 p-6 flex items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-etihad-gold-600" />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {getSidebar()}
      <main className="flex-1 overflow-auto">
        {/* Header with Family Selector */}
        <div className="bg-white px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Data Gathering</h1>
                <p className="text-gray-500 text-sm mt-1">Collect financial information</p>
              </div>
              
              {/* Family Selector - Inline with header */}
              <div className="flex items-center gap-3 border-l pl-6">
                {/* Family Selector Dropdown - Shows saved families */}
                <Select 
                  value={selectedFamily?.id || ""} 
                  onValueChange={(value) => {
                    const family = families.find(f => f.id === value);
                    if (family) handleSelectFamily(family);
                  }}
                >
                  <SelectTrigger className="w-64 h-9">
                    <SelectValue placeholder="Select a family">
                      {selectedFamily ? (
                        <span className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          {selectedFamily.family_name?.length > 25 
                            ? selectedFamily.family_name.substring(0, 25) + '...' 
                            : selectedFamily.family_name}
                        </span>
                      ) : (
                        <span className="text-gray-500">Select a family</span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {/* Search inside dropdown */}
                    <div className="p-2 border-b">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Search families..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-8 h-8 text-sm"
                        />
                      </div>
                    </div>
                    {/* Family list */}
                    <div className="max-h-[300px] overflow-y-auto">
                      {filteredFamilies.length > 0 ? (
                        filteredFamilies.map((family) => (
                          <SelectItem key={family.id} value={family.id}>
                            <span className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-gray-400" />
                              {family.family_name}
                              <Badge variant="secondary" className="ml-auto text-xs">{family.members?.length || 0}</Badge>
                            </span>
                          </SelectItem>
                        ))
                      ) : (
                        <div className="px-2 py-4 text-sm text-gray-500 text-center">
                          {searchTerm ? `No families matching "${searchTerm}"` : "No families yet"}
                        </div>
                      )}
                    </div>
                  </SelectContent>
                </Select>

                {/* New Family Button - Separate */}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleNewFamily}
                  className="gap-2 border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  New Family
                </Button>
              </div>
            </div>
            
            <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white border-b px-6">
          <div className="flex items-center gap-1 overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              // Get count for each tab from selected family
              let count = null;
              if (selectedFamily) {
                switch (tab.id) {
                  case "introduction": count = selectedFamily.members?.length || 0; break;
                  case "income": count = selectedFamily.income_details?.length || 0; break;
                  case "goals": count = selectedFamily.goal_details?.length || 0; break;
                  case "expenses": count = selectedFamily.expense_details?.length || 0; break;
                  case "insurance": count = selectedFamily.insurance_premiums?.length || 0; break;
                  case "liability": count = selectedFamily.liabilities?.length || 0; break;
                  default: count = null;
                }
              }
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isActive 
                      ? 'text-blue-600 border-blue-600' 
                      : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                  {count !== null && count > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 min-w-5 text-xs">{count}</Badge>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content - Full Width */}
        <div className="p-6">
          <div className="bg-white rounded-lg border min-h-[500px] p-6">
            {renderTabContent()}
          </div>
        </div>
      </main>

      {/* Why Do This Exercise Modal */}
      <Dialog open={showWhyModal} onOpenChange={setShowWhyModal}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-xl">
              <div className="p-2 bg-amber-100 rounded-full">
                <Lightbulb className="h-6 w-6 text-amber-600" />
              </div>
              Why do this exercise?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-gray-600 leading-relaxed">
              Objectifying the purpose of investment.
            </p>
            
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                <p className="text-gray-700">
                  Help our investors understand what is the minimum return they should earn on their entire portfolio to make sure that it at least lasts long till their life expectancy or meet their lifestyle inflation.
                </p>
              </div>
              
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                <p className="text-gray-700">
                  What is the real return each of their financial and physical assets have given them over years of investments.
                </p>
              </div>
              
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                <p className="text-gray-700">
                  How much risk one should take to achieve minimum return requirement and what asset class has the highest probability to achieve it.
                </p>
              </div>
              
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                <p className="text-gray-700">
                  On one single sheet you will be able to assess your current and future cash flows (both inflow and outflow).
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end pt-2">
            <Button 
              onClick={handleStartDataGathering}
              className="bg-etihad-gold-600 hover:bg-etihad-gold-700 text-white px-8"
            >
              Start
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
