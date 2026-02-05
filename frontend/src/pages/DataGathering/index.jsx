import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Plus, Users, DollarSign, Target, Receipt, Shield, CreditCard, 
  TrendingUp, ChevronRight, Search, Edit, Trash2, Eye, RefreshCw 
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

import FamilyList from "./FamilyList";
import FamilyForm from "./FamilyForm";
import FamilyDetail from "./FamilyDetail";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function DataGathering() {
  const navigate = useNavigate();
  const { familyId } = useParams();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [families, setFamilies] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedFamily, setSelectedFamily] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    document.title = "Kinntegraa | Data Gathering";
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    setUser(JSON.parse(userData));
    fetchFamilies();
  }, [navigate]);

  useEffect(() => {
    if (familyId && families.length > 0) {
      const family = families.find(f => f.id === familyId);
      if (family) {
        setSelectedFamily(family);
      }
    }
  }, [familyId, families]);

  const fetchFamilies = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/data-gathering/families`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFamilies(response.data.families || []);
    } catch (error) {
      console.error("Error fetching families:", error);
      toast.error("Failed to load families");
    } finally {
      setLoading(false);
    }
  };

  const handleFamilyCreated = (newFamily) => {
    setFamilies([newFamily, ...families]);
    setShowCreateForm(false);
    toast.success("Family created successfully");
  };

  const handleSelectFamily = (family) => {
    setSelectedFamily(family);
    const basePath = user?.role === 'broker' ? '/broker' : '/sub-broker';
    navigate(`${basePath}/data-gathering/${family.id}`);
  };

  const handleBackToList = () => {
    setSelectedFamily(null);
    const basePath = user?.role === 'broker' ? '/broker' : '/sub-broker';
    navigate(`${basePath}/data-gathering`);
  };

  const handleDeleteFamily = async (familyId) => {
    if (!window.confirm("Are you sure you want to delete this family and all its data?")) {
      return;
    }
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/data-gathering/family/${familyId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFamilies(families.filter(f => f.id !== familyId));
      toast.success("Family deleted successfully");
      if (selectedFamily?.id === familyId) {
        handleBackToList();
      }
    } catch (error) {
      toast.error("Failed to delete family");
    }
  };

  const filteredFamilies = families.filter(f => 
    f.family_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.members?.some(m => m.name?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getSidebar = () => {
    if (user?.role === "broker") return <Sidebar user={user} />;
    if (user?.role === "sub_broker") return <SubBrokerSidebar user={user} />;
    return null;
  };

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

  // If a family is selected, show the detail view
  if (selectedFamily) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        {getSidebar()}
        <main className="flex-1 overflow-auto">
          <FamilyDetail 
            family={selectedFamily} 
            onBack={handleBackToList}
            onUpdate={(updatedFamily) => {
              setFamilies(families.map(f => f.id === updatedFamily.id ? updatedFamily : f));
              setSelectedFamily(updatedFamily);
            }}
            user={user}
          />
        </main>
      </div>
    );
  }

  // If creating new family
  if (showCreateForm) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        {getSidebar()}
        <main className="flex-1 overflow-auto">
          <FamilyForm 
            onCancel={() => setShowCreateForm(false)}
            onSubmit={handleFamilyCreated}
            user={user}
          />
        </main>
      </div>
    );
  }

  // Default: Show family list
  return (
    <div className="flex min-h-screen bg-gray-50">
      {getSidebar()}
      <main className="flex-1 p-6 overflow-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Data Gathering</h1>
            <p className="text-gray-500 text-sm mt-1">
              Collect financial information for comprehensive planning
            </p>
          </div>
          <Button 
            onClick={() => setShowCreateForm(true)}
            className="bg-etihad-gold-600 hover:bg-etihad-gold-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Family
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search families or members..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{families.length}</p>
                  <p className="text-xs text-gray-500">Total Families</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <DollarSign className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {families.reduce((sum, f) => sum + (f.income_details?.length || 0), 0)}
                  </p>
                  <p className="text-xs text-gray-500">Income Records</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Target className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {families.reduce((sum, f) => sum + (f.goal_details?.length || 0), 0)}
                  </p>
                  <p className="text-xs text-gray-500">Goals Set</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {families.filter(f => f.status === 'completed').length}
                  </p>
                  <p className="text-xs text-gray-500">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Family List */}
        {filteredFamilies.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Users className="h-12 w-12 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchTerm ? "No families found" : "No families yet"}
              </h3>
              <p className="text-gray-500 mb-4">
                {searchTerm 
                  ? "Try adjusting your search terms"
                  : "Create your first family to start collecting financial data"
                }
              </p>
              {!searchTerm && (
                <Button onClick={() => setShowCreateForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Family
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredFamilies.map((family) => (
              <Card 
                key={family.id} 
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleSelectFamily(family)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-etihad-gold-100 flex items-center justify-center">
                        <Users className="h-6 w-6 text-etihad-gold-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{family.family_name}</h3>
                        <p className="text-sm text-gray-500">
                          {family.members?.length || 0} members • Created {format(new Date(family.created_at), "MMM d, yyyy")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="hidden md:flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          <DollarSign className="h-3 w-3 mr-1" />
                          {family.income_details?.length || 0}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          <Target className="h-3 w-3 mr-1" />
                          {family.goal_details?.length || 0}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          <Receipt className="h-3 w-3 mr-1" />
                          {family.expense_details?.length || 0}
                        </Badge>
                      </div>
                      <Badge 
                        className={
                          family.status === 'completed' 
                            ? 'bg-green-100 text-green-700' 
                            : family.status === 'in_progress'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-gray-100 text-gray-700'
                        }
                      >
                        {family.status || 'Draft'}
                      </Badge>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectFamily(family);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFamily(family.id);
                          }}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
