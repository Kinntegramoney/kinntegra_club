import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import CreateRealEstateModal from "@/components/CreateRealEstateModal";
import { Plus, Building2, Search, Edit2, Trash2, Eye, MapPin, Upload, Users, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function AdminRealEstate() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Set page title
  useEffect(() => {
    document.title = "Kinntegraa | Real Estate";
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "broker") {
      navigate("/login");
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
      // Handle both old format (array) and new paginated format (object with data property)
      const data = Array.isArray(response.data) 
        ? response.data 
        : (response.data?.data || []);
      setOpportunities(data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching opportunities:", error);
      setLoading(false);
    }
  };

  const handleDelete = async (id, name, investorCount = 0) => {
    let confirmMessage = `Delete "${name}"? This cannot be undone.`;
    
    if (investorCount > 0) {
      confirmMessage = `⚠️ WARNING: "${name}" has ${investorCount} investor(s)!\n\nDeleting will remove all investment records.\n\nAre you absolutely sure?`;
    }
    
    if (!window.confirm(confirmMessage)) return;
    
    // Double confirmation for properties with investors
    if (investorCount > 0) {
      if (!window.confirm("This is your FINAL warning. Type OK to confirm deletion.")) return;
    }

    try {
      const token = localStorage.getItem("token");
      const url = investorCount > 0 
        ? `${API}/real-estate-opportunities/${id}?force=true`
        : `${API}/real-estate-opportunities/${id}`;
      
      await axios.delete(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Property deleted successfully");
      fetchOpportunities();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete");
    }
  };

  const handleToggleVisibility = async (opportunityId, currentVisibility) => {
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `${API}/real-estate-opportunities/${opportunityId}/visibility?visible_to_all_sub_brokers=${!currentVisibility}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`Property ${!currentVisibility ? 'now visible' : 'hidden'} to all sub-brokers`);
      fetchOpportunities();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update visibility");
    }
  };

  const filteredOpportunities = opportunities.filter(opp =>
    opp.building_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    opp.unit_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (opp.location && opp.location.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
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
              <h1 className="text-2xl font-bold text-gray-800">Real Estate Opportunities</h1>
              <p className="text-sm text-gray-500 mt-1">Manage property investment opportunities</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search properties..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
              <Button 
                variant="outline"
                onClick={() => navigate('/broker/bulk-upload?tab=real-estate')}
              >
                <Upload className="h-4 w-4 mr-2" />
                Bulk Upload
              </Button>
              <Button onClick={() => setShowCreateModal(true)} className="bg-teal-600 hover:bg-teal-700">
                <Plus className="h-4 w-4 mr-2" />
                Add Property
              </Button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="p-8">
          {loading ? (
            <p className="text-center text-gray-500 py-12">Loading...</p>
          ) : filteredOpportunities.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">
                {searchQuery ? "No properties found" : "No real estate opportunities yet"}
              </p>
              {!searchQuery && (
                <Button onClick={() => setShowCreateModal(true)} className="bg-teal-600 hover:bg-teal-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Property
                </Button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Property</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Type</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Total Cost</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Investors</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Created By</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="text-right px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredOpportunities.map((opp) => (
                    <tr key={opp.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {/* Property Image */}
                          {opp.images && opp.images.length > 0 ? (
                            <img 
                              src={`${process.env.REACT_APP_BACKEND_URL}/api/real-estate-opportunities/${opp.id}/images/${opp.images[0].id}`}
                              alt={opp.building_name}
                              className="w-16 h-16 rounded-lg object-cover flex-shrink-0 bg-gray-100"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextElementSibling && (e.target.nextElementSibling.style.display = 'flex');
                              }}
                            />
                          ) : null}
                          <div className={`w-16 h-16 bg-teal-100 rounded-lg items-center justify-center flex-shrink-0 ${opp.images && opp.images.length > 0 ? 'hidden' : 'flex'}`}>
                            <Building2 className="h-6 w-6 text-teal-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-800">{opp.building_name}</p>
                            <p className="text-sm text-gray-500">Unit {opp.unit_no} • {opp.unit_type} • Floor {opp.floor}</p>
                            {opp.location && (
                              <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                <MapPin className="h-3 w-3" />
                                {opp.location}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {opp.property_type === 'off_plan' ? (
                          <Badge className="bg-purple-100 text-purple-700">Off-Plan</Badge>
                        ) : (
                          <Badge className="bg-teal-100 text-teal-700">Fractional</Badge>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono font-medium">AED {formatCurrency(opp.total_cost)}</span>
                        <p className="text-xs text-gray-500">{opp.total_area} sqft</p>
                      </td>
                      <td className="px-6 py-4">
                        {opp.property_type === 'off_plan' ? (
                          <span className="text-purple-600 font-medium">{opp.current_investors}/4</span>
                        ) : (
                          <span className="text-teal-600 font-medium">
                            {opp.total_cost > 0 ? Math.round((opp.total_invested || 0) / opp.total_cost * 100) : 0}%
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {opp.created_by_sub_broker ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5">
                              <Users className="h-3.5 w-3.5 text-orange-500" />
                              <span className="text-sm font-medium text-orange-700">
                                {opp.created_by_sub_broker.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Globe className="h-3 w-3 text-gray-400" />
                              <span className="text-xs text-gray-500">Share with all</span>
                              <Switch
                                checked={opp.visible_to_all_sub_brokers || false}
                                onCheckedChange={() => handleToggleVisibility(opp.id, opp.visible_to_all_sub_brokers)}
                                className="scale-75"
                                data-testid={`visibility-toggle-${opp.id}`}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500">You (Broker)</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {opp.status === 'available' && (
                          <Badge className="bg-green-100 text-green-700">Available</Badge>
                        )}
                        {opp.status === 'fully_invested' && (
                          <Badge className="bg-blue-100 text-blue-700">Fully Invested</Badge>
                        )}
                        {opp.status === 'closed' && (
                          <Badge className="bg-gray-100 text-gray-700">Closed</Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/broker/real-estate/${opp.id}`)}
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingOpportunity(opp)}
                            title="Edit"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(opp.id, opp.building_name, opp.current_investors || 0)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            title="Delete"
                            data-testid={`delete-property-${opp.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
      {editingOpportunity && (
        <CreateRealEstateModal
          opportunity={editingOpportunity}
          onClose={() => setEditingOpportunity(null)}
          onSuccess={() => {
            setEditingOpportunity(null);
            fetchOpportunities();
          }}
        />
      )}
    </div>
  );
}
