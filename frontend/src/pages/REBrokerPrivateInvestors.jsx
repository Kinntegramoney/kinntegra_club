import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { 
  UserCheck, Plus, RefreshCw, Search, Edit2, Mail, Phone, Users, Upload,
  MoreVertical, KeyRound, UserMinus, Trash2, UserX
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import REBrokerSidebar from "@/components/REBrokerSidebar";
import CreateREInvestorModal from "@/components/CreateREInvestorModal";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function REBrokerPrivateInvestors() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [brokerProfile, setBrokerProfile] = useState(null);
  const [investors, setInvestors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    document.title = "Kinntegraa | RE Broker - Private Investors";
    
    const userData = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    
    if (!userData || !token) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "re_broker") {
      navigate("/login");
      return;
    }
    
    setUser(parsedUser);
    fetchBrokerProfile(token);
    fetchInvestors(token);
  }, [navigate]);

  const fetchBrokerProfile = async (token) => {
    try {
      const response = await axios.get(`${API}/re-broker/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBrokerProfile(response.data);
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  };

  const fetchInvestors = useCallback(async (token) => {
    setLoading(true);
    try {
      const tkn = token || localStorage.getItem("token");
      const response = await axios.get(`${API}/re-broker/private-investors`, {
        headers: { Authorization: `Bearer ${tkn}` }
      });
      const data = response.data;
      setInvestors(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching investors:", error);
      setInvestors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const filteredInvestors = investors.filter(inv => {
    const query = searchQuery.toLowerCase();
    return (
      inv.name?.toLowerCase().includes(query) ||
      inv.email?.toLowerCase().includes(query) ||
      inv.phone?.toLowerCase().includes(query) ||
      inv.pan?.toLowerCase().includes(query)
    );
  });

  const handleResendCredentials = async (investor) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API}/re-broker/investors/${investor.id}/resend-credentials`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(`Credentials sent to ${investor.email}`);
    } catch (error) {
      toast.error("Failed to resend credentials");
    }
  };

  const handleResetPassword = async (investor) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API}/re-broker/investors/${investor.id}/reset-password`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(`Password reset link sent to ${investor.email}`);
    } catch (error) {
      toast.error("Failed to reset password");
    }
  };

  const handleDeactivate = async (investor) => {
    if (!window.confirm(`Deactivate investor "${investor.name}"?`)) return;
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API}/re-broker/investors/${investor.id}/deactivate`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Investor deactivated");
      fetchInvestors();
    } catch (error) {
      toast.error("Failed to deactivate investor");
    }
  };

  const handleDelete = async (investor) => {
    if (!window.confirm(`Delete investor "${investor.name}"? This action cannot be undone.`)) return;
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/re-broker/investors/${investor.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Investor deleted");
      fetchInvestors();
    } catch (error) {
      toast.error("Failed to delete investor");
    }
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <REBrokerSidebar user={user} brokerProfile={brokerProfile} />
      
      <div className="flex-1 md:ml-0 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="ml-12 md:ml-0">
              <h1 className="text-xl md:text-2xl font-bold text-gray-800" data-testid="private-investors-title">
                Private Investors
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Manage private investor accounts and their real estate investments
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search investors..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-64"
                  data-testid="search-input"
                />
              </div>
              <Button 
                variant="outline" 
                onClick={() => fetchInvestors()} 
                data-testid="refresh-btn"
                className="border-gray-300"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                onClick={() => navigate('/re-broker/bulk-upload?tab=investors')}
                variant="outline"
                className="border-blue-300 text-blue-700 hover:bg-blue-50"
                data-testid="bulk-upload-btn"
              >
                <Upload className="h-4 w-4 mr-2" />
                Bulk Upload
              </Button>
              <Button 
                onClick={() => setShowAddModal(true)}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="add-investor-btn"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Investor
              </Button>
            </div>
          </div>
        </div>

        {/* Private Investors Table */}
        <div className="p-4 md:p-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : filteredInvestors.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border">
              <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">
                {searchQuery ? "No investors found" : "No private investors created yet"}
              </p>
              {!searchQuery && (
                <Button 
                  onClick={() => setShowAddModal(true)}
                  className="bg-blue-600 hover:bg-blue-700 mt-4"
                  data-testid="add-first-investor-btn"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Investor
                </Button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Investor Name</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Passport/PAN</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Contact</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Linked Agent</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="text-right py-4 px-6 text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvestors.map((investor) => {
                    const initials = investor.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'IN';
                    const isInactive = investor.status === 'inactive' || investor.is_active === false;

                    return (
                      <tr 
                        key={investor.id} 
                        className={`border-t border-gray-100 hover:bg-gray-50 ${isInactive ? 'opacity-60 bg-gray-50' : ''}`} 
                        data-testid={`investor-row-${investor.id}`}
                      >
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-medium text-sm ${
                              isInactive ? 'bg-gray-200 text-gray-500' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {isInactive ? <UserX className="h-5 w-5" /> : initials}
                            </div>
                            <div>
                              <span className="font-medium block">{investor.name}</span>
                              <span className="text-xs text-gray-500">{investor.city || 'N/A'}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6 font-mono text-sm">
                          {investor.pan || investor.passport_number || 'N/A'}
                        </td>
                        <td className="py-4 px-6">
                          <div className="text-sm">{investor.email}</div>
                          <div className="text-xs text-gray-500">{investor.phone || 'N/A'}</div>
                        </td>
                        <td className="py-4 px-6">
                          {investor.linked_agent_name ? (
                            <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
                              {investor.linked_agent_name}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          {isInactive ? (
                            <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full">Inactive</span>
                          ) : investor.kyc_verified ? (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">Verified</span>
                          ) : (
                            <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full">Active</span>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center justify-end gap-1">
                            {isInactive ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {/* handleReactivate */}}
                                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                title="Reactivate investor"
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {/* handleEdit */}}
                                  title="Edit investor"
                                  data-testid={`edit-investor-${investor.id}`}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" data-testid={`investor-menu-${investor.id}`}>
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem 
                                      onClick={() => handleResendCredentials(investor)}
                                      className="cursor-pointer"
                                    >
                                      <Mail className="h-4 w-4 mr-2" />
                                      Resend Credentials
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onClick={() => handleResetPassword(investor)}
                                      className="cursor-pointer"
                                    >
                                      <KeyRound className="h-4 w-4 mr-2" />
                                      Reset Password
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                      onClick={() => handleDeactivate(investor)}
                                      className="cursor-pointer text-amber-600"
                                    >
                                      <UserMinus className="h-4 w-4 mr-2" />
                                      Deactivate Investor
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onClick={() => handleDelete(investor)}
                                      className="cursor-pointer text-red-600"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete Investor
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      
      {/* Add Investor Modal */}
      {showAddModal && (
        <CreateREInvestorModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            fetchInvestors();
            toast.success("Investor created successfully!");
          }}
        />
      )}
    </div>
  );
}
