import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import CreatePartnerModal from "@/components/CreatePartnerModal";
import EditPartnerModal from "@/components/EditPartnerModal";
import { Plus, Edit2, Trash2, RefreshCw, UserX, Upload, MoreVertical, Mail, KeyRound, UserMinus, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function AdminSubBrokers() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPartner, setEditingPartner] = useState(null);
  
  // Search and Sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState("name");
  const [sortDirection, setSortDirection] = useState("asc");

  // Set page title
  useEffect(() => {
    document.title = "Kinntegraa | Sub-Brokers";
  }, []);

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
    fetchPartners();
  }, [navigate]);

  const fetchPartners = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/partners`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPartners(response.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching partners:", error);
      setLoading(false);
    }
  };

  const handleDelete = async (partnerId, partnerName) => {
    if (!window.confirm(`Delete/Deactivate sub-broker "${partnerName}"? Sub-brokers with trades or linked clients will be marked as inactive instead.`)) return;

    try {
      const token = localStorage.getItem("token");
      const response = await axios.delete(`${API}/partners/${partnerId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.soft_delete) {
        toast.success("Sub-broker marked as inactive (has trades or linked clients)");
      } else {
        toast.success("Sub-broker deleted successfully");
      }
      fetchPartners();
    } catch (error) {
      console.error("Error deleting partner:", error);
      toast.error("Failed to delete sub-broker");
    }
  };

  const handleReactivate = async (partnerId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API}/partners/${partnerId}/reactivate`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Sub-broker reactivated successfully");
      fetchPartners();
    } catch (error) {
      console.error("Error reactivating partner:", error);
      toast.error("Failed to reactivate sub-broker");
    }
  };

  const handleResendCredentials = async (partner) => {
    if (!partner.email) {
      toast.error("No email address found for this sub-broker");
      return;
    }
    
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API}/partners/${partner.id}/resend-credentials`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(`Login credentials sent to ${partner.email}`);
    } catch (error) {
      console.error("Error resending credentials:", error);
      toast.error(error.response?.data?.detail || "Failed to resend credentials");
    }
  };

  const handleResetPassword = async (partner) => {
    if (!window.confirm(`Reset password for "${partner.name}"? A new password will be generated and emailed to ${partner.email || 'the sub-broker'}.`)) return;
    
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(`${API}/partners/${partner.id}/reset-password`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.new_password) {
        toast.success(`Password reset! New password: ${response.data.new_password}`, { duration: 10000 });
      } else {
        toast.success("Password reset successfully. New credentials emailed to sub-broker.");
      }
      fetchPartners();
    } catch (error) {
      console.error("Error resetting password:", error);
      toast.error(error.response?.data?.detail || "Failed to reset password");
    }
  };

  const handleDeactivate = async (partner) => {
    if (!window.confirm(`Deactivate sub-broker "${partner.name}"? They will no longer be able to login.`)) return;
    
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API}/partners/${partner.id}/deactivate`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Sub-broker deactivated successfully");
      fetchPartners();
    } catch (error) {
      console.error("Error deactivating partner:", error);
      toast.error(error.response?.data?.detail || "Failed to deactivate sub-broker");
    }
  };

  // Filter and sort partners
  const filteredPartners = partners
    .filter(partner => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        partner.name?.toLowerCase().includes(query) ||
        partner.email?.toLowerCase().includes(query) ||
        partner.phone?.toLowerCase().includes(query) ||
        partner.partner_code?.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      let aVal = a[sortField] || "";
      let bVal = b[sortField] || "";
      
      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();
      
      if (sortDirection === "asc") {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4 text-gray-400" />;
    return sortDirection === "asc" 
      ? <ArrowUp className="h-4 w-4 text-etihad-gold-600" /> 
      : <ArrowDown className="h-4 w-4 text-etihad-gold-600" />;
  };

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-800" data-testid="admin-subbrokers-title">Admin - Sub Brokers</h1>
              <p className="text-sm text-gray-500 mt-1">Manage all sub-broker partners ({filteredPartners.length} of {partners.length})</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Search Bar - Inline */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search sub-brokers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-[200px]"
                  data-testid="subbroker-search-input"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => navigate('/broker/bulk-upload?tab=sub-brokers')}
                data-testid="bulk-upload-subbroker-btn"
              >
                <Upload className="h-4 w-4 mr-2" />
                Bulk Upload
              </Button>
              <Button
                onClick={() => setShowCreateModal(true)}
                className="bg-etihad-gold-700 hover:bg-etihad-gold-800"
                data-testid="create-subbroker-btn"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Sub Broker
              </Button>
            </div>
          </div>
        </div>

        {/* Partners Table */}
        <div className="p-4 md:p-8">
          {loading ? (
            <p className="text-center text-gray-500 py-12">Loading...</p>
          ) : partners.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No sub-brokers created yet</p>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Sub Broker
              </Button>
            </div>
          ) : filteredPartners.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No sub-brokers match your search</p>
              <Button variant="outline" onClick={() => setSearchQuery("")}>
                Clear Search
              </Button>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th 
                      className="text-left py-4 px-4 md:px-6 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort("name")}
                    >
                      <div className="flex items-center gap-2">
                        Partner Name
                        <SortIcon field="name" />
                      </div>
                    </th>
                    <th 
                      className="text-left py-4 px-4 md:px-6 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort("partner_code")}
                    >
                      <div className="flex items-center gap-2">
                        Code
                        <SortIcon field="partner_code" />
                      </div>
                    </th>
                    <th 
                      className="text-left py-4 px-4 md:px-6 text-xs font-medium text-gray-500 uppercase hidden md:table-cell cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort("email")}
                    >
                      <div className="flex items-center gap-2">
                        Email
                        <SortIcon field="email" />
                      </div>
                    </th>
                    <th className="text-left py-4 px-4 md:px-6 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Mobile</th>
                    <th 
                      className="text-left py-4 px-4 md:px-6 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort("is_active")}
                    >
                      <div className="flex items-center gap-2">
                        Status
                        <SortIcon field="is_active" />
                      </div>
                    </th>
                    <th className="text-right py-4 px-4 md:px-6 text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPartners.map((partner) => {
                    const initials = partner.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                    const isInactive = partner.is_active === false;

                    return (
                      <tr key={partner.id} className={`border-t border-gray-100 hover:bg-gray-50 ${isInactive ? 'opacity-60 bg-gray-50' : ''}`} data-testid={`partner-row-${partner.id}`}>
                        <td className="py-4 px-4 md:px-6">
                          <div className="flex items-center gap-3">
                            <div 
                              className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium text-sm ${isInactive ? 'bg-gray-400' : ''}`}
                              style={{ backgroundColor: isInactive ? undefined : (partner.color || '#78716C') }}
                            >
                              {isInactive ? <UserX className="h-5 w-5" /> : initials}
                            </div>
                            <div className="min-w-0">
                              <span className="font-medium block truncate">
                                {partner.name}
                              </span>
                              <span className="text-xs text-gray-500 md:hidden">{partner.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4 md:px-6 font-mono text-sm">{partner.partner_code}</td>
                        <td className="py-4 px-4 md:px-6 text-sm hidden md:table-cell truncate max-w-[200px]">{partner.email}</td>
                        <td className="py-4 px-4 md:px-6 text-sm font-mono hidden md:table-cell">{partner.mobile}</td>
                        <td className="py-4 px-4 md:px-6">
                          {isInactive ? (
                            <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full">Inactive</span>
                          ) : (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">Active</span>
                          )}
                        </td>
                        <td className="py-4 px-4 md:px-6">
                          <div className="flex items-center justify-end gap-1">
                            {isInactive ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleReactivate(partner.id)}
                                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                title="Reactivate sub-broker"
                                data-testid={`reactivate-partner-${partner.id}`}
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEditingPartner(partner)}
                                  data-testid={`edit-partner-${partner.id}`}
                                  title="Edit sub-broker"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                
                                {/* 3-dots dropdown menu */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      data-testid={`more-options-${partner.id}`}
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem 
                                      onClick={() => handleResendCredentials(partner)}
                                      className="cursor-pointer"
                                      data-testid={`resend-credentials-${partner.id}`}
                                    >
                                      <Mail className="h-4 w-4 mr-2" />
                                      Resend Credentials
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onClick={() => handleResetPassword(partner)}
                                      className="cursor-pointer"
                                      data-testid={`reset-password-${partner.id}`}
                                    >
                                      <KeyRound className="h-4 w-4 mr-2" />
                                      Reset Password
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                      onClick={() => handleDeactivate(partner)}
                                      className="cursor-pointer text-red-600 focus:text-red-600"
                                      data-testid={`deactivate-partner-${partner.id}`}
                                    >
                                      <UserMinus className="h-4 w-4 mr-2" />
                                      Deactivate
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

      {/* Create Modal */}
      {showCreateModal && (
        <CreatePartnerModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchPartners();
          }}
        />
      )}

      {/* Edit Modal */}
      {editingPartner && (
        <EditPartnerModal
          partner={editingPartner}
          onClose={() => setEditingPartner(null)}
          onSuccess={() => {
            setEditingPartner(null);
            fetchPartners();
          }}
        />
      )}
    </div>
  );
}
