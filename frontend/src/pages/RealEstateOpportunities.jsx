import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import CreateRealEstateModal from "@/components/CreateRealEstateModal";
import { 
  Plus, Search, Building2, MapPin, Calendar, Users, 
  Image, Edit2, Trash2, Eye, DollarSign, SquareStack, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function RealEstateOpportunities() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [selectedOpportunity, setSelectedOpportunity] = useState(null);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "broker") {
      navigate("/sub-broker/opportunities");
      return;
    }
    
    setUser(parsedUser);
    fetchOpportunities();
  }, [navigate]);

  const fetchOpportunities = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/real-estate-opportunities`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOpportunities(response.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching opportunities:", error);
      setLoading(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete real estate opportunity "${name}"?`)) return;

    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/real-estate-opportunities/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Opportunity deleted successfully");
      fetchOpportunities();
    } catch (error) {
      console.error("Error deleting opportunity:", error);
      toast.error(error.response?.data?.detail || "Failed to delete opportunity");
    }
  };

  const filteredOpportunities = opportunities.filter(opp => {
    const matchesSearch = 
      opp.building_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      opp.unit_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (opp.location && opp.location.toLowerCase().includes(searchQuery.toLowerCase()));
    
    if (activeTab === "all") return matchesSearch;
    if (activeTab === "off_plan") return matchesSearch && opp.property_type === "off_plan";
    if (activeTab === "fractional") return matchesSearch && opp.property_type === "fractional";
    if (activeTab === "available") return matchesSearch && opp.status === "available";
    if (activeTab === "fully_invested") return matchesSearch && opp.status === "fully_invested";
    return matchesSearch;
  });

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-AE', { 
      style: 'currency', 
      currency: 'AED',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'available':
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Available</Badge>;
      case 'fully_invested':
        return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Fully Invested</Badge>;
      case 'closed':
        return <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100">Closed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeBadge = (type) => {
    if (type === 'off_plan') {
      return <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">Off-Plan (Max 4)</Badge>;
    }
    return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Fractional</Badge>;
  };

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800" data-testid="real-estate-title">
                Real Estate Opportunities
              </h1>
              <p className="text-sm text-gray-500 mt-1">Manage property investment opportunities</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  data-testid="search-opportunities"
                  placeholder="Search by building, unit, location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-72"
                />
              </div>
              <Button
                onClick={() => setShowCreateModal(true)}
                className="bg-teal-600 hover:bg-teal-700"
                data-testid="create-opportunity-btn"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Opportunity
              </Button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-8 pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full max-w-xl grid-cols-5">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="off_plan">Off-Plan</TabsTrigger>
              <TabsTrigger value="fractional">Fractional</TabsTrigger>
              <TabsTrigger value="available">Available</TabsTrigger>
              <TabsTrigger value="fully_invested">Invested</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Opportunities Grid */}
        <div className="p-8">
          {loading ? (
            <p className="text-center text-gray-500 py-12">Loading...</p>
          ) : filteredOpportunities.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">
                {searchQuery ? "No opportunities found" : "No real estate opportunities yet"}
              </p>
              {!searchQuery && (
                <Button onClick={() => setShowCreateModal(true)} className="bg-teal-600 hover:bg-teal-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Opportunity
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredOpportunities.map((opp) => (
                <div 
                  key={opp.id} 
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
                  data-testid={`opportunity-card-${opp.id}`}
                >
                  {/* Image Section */}
                  <div className="h-48 bg-gray-100 relative">
                    {opp.images && opp.images.length > 0 ? (
                      <img 
                        src={`data:${opp.images[0].content_type};base64,${opp.images[0].data}`}
                        alt={opp.building_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <Building2 className="h-16 w-16 text-gray-300" />
                      </div>
                    )}
                    <div className="absolute top-3 left-3 flex gap-2">
                      {getTypeBadge(opp.property_type)}
                    </div>
                    <div className="absolute top-3 right-3">
                      {getStatusBadge(opp.status)}
                    </div>
                    {opp.images && opp.images.length > 1 && (
                      <div className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                        <Image className="h-3 w-3" />
                        {opp.images.length}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-gray-800 text-lg">{opp.building_name}</h3>
                        <p className="text-sm text-gray-500">Unit {opp.unit_no} • Floor {opp.floor}</p>
                      </div>
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded font-medium">
                        {opp.unit_type}
                      </span>
                    </div>

                    {opp.location && (
                      <div className="flex items-center gap-1 text-sm text-gray-500 mb-3">
                        <MapPin className="h-4 w-4" />
                        {opp.location}
                      </div>
                    )}

                    {/* Price */}
                    <div className="bg-gray-50 rounded-lg p-3 mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-500">Total Investment</span>
                        <span className="font-bold text-lg text-gray-800">{formatCurrency(opp.total_cost)}</span>
                      </div>
                      {opp.property_type === 'fractional' && opp.fractional_info && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">Per Unit (500 AED)</span>
                          <span className="font-medium text-teal-600">
                            {opp.units_available} / {opp.fractional_info.total_units} available
                          </span>
                        </div>
                      )}
                      {opp.property_type === 'off_plan' && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">Investors</span>
                          <span className="font-medium text-purple-600">
                            {opp.current_investors} / 4
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
                      <div className="text-center">
                        <SquareStack className="h-4 w-4 mx-auto text-gray-400 mb-1" />
                        <span className="text-gray-500">{opp.total_area} sqft</span>
                      </div>
                      <div className="text-center">
                        <Users className="h-4 w-4 mx-auto text-gray-400 mb-1" />
                        <span className="text-gray-500">{opp.parking_spaces} Parking</span>
                      </div>
                      <div className="text-center">
                        <Clock className="h-4 w-4 mx-auto text-gray-400 mb-1" />
                        <span className="text-gray-500">{opp.time_frame_days} days</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/broker/real-estate/${opp.id}`)}
                        className="text-teal-600 hover:text-teal-700 hover:bg-teal-50"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View Details
                      </Button>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedOpportunity(opp)}
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        {opp.current_investors === 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(opp.id, opp.building_name)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateRealEstateModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchOpportunities();
          }}
        />
      )}

      {/* Edit Modal */}
      {selectedOpportunity && (
        <CreateRealEstateModal
          opportunity={selectedOpportunity}
          onClose={() => setSelectedOpportunity(null)}
          onSuccess={() => {
            setSelectedOpportunity(null);
            fetchOpportunities();
          }}
        />
      )}
    </div>
  );
}
