import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import CreateClientModal from "@/components/CreateClientModal";
import EditClientModal from "@/components/EditClientModal";
import BulkUploadModal from "@/components/BulkUploadModal";
import { Plus, Edit2, Trash2, Link2, Search, Users, FileText, RefreshCw, UserX, Upload, MoreVertical, Mail, KeyRound, UserMinus, Copy, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function AdminClients() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [clients, setClients] = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [linkingClient, setLinkingClient] = useState(null);
  
  // Edit modal state - now uses EditClientModal component
  const [editingClient, setEditingClient] = useState(null);

  // Set page title
  useEffect(() => {
    document.title = "Kinntegraa | Clients";
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
    fetchData();
  }, [navigate]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };
      
      const [clientsRes, partnersRes] = await Promise.all([
        axios.get(`${API}/clients`, { headers }),
        axios.get(`${API}/partners`, { headers })
      ]);
      
      setClients(clientsRes.data);
      setPartners(partnersRes.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching data:", error);
      setLoading(false);
    }
  };

  const handleDelete = async (clientId, clientName) => {
    if (!window.confirm(`Delete/Deactivate client "${clientName}"? Clients with confirmed trades will be marked as inactive instead.`)) return;

    try {
      const token = localStorage.getItem("token");
      const response = await axios.delete(`${API}/clients/${clientId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.soft_delete) {
        toast.success("Client marked as inactive (has confirmed trades)");
      } else {
        toast.success("Client deleted successfully");
      }
      fetchData();
    } catch (error) {
      console.error("Error deleting client:", error);
      toast.error("Failed to delete client");
    }
  };

  const handleReactivate = async (clientId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API}/clients/${clientId}/reactivate`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Client reactivated successfully");
      fetchData();
    } catch (error) {
      console.error("Error reactivating client:", error);
      toast.error("Failed to reactivate client");
    }
  };

  const handleSyncActivation = async (clientId) => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(`${API}/clients/${clientId}/sync-activation`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.synced) {
        toast.success(`Activation synced: ${response.data.is_active ? 'Active' : 'Inactive'}`);
      } else {
        toast.warning(response.data.message);
      }
      fetchData();
    } catch (error) {
      console.error("Error syncing activation:", error);
      toast.error("Failed to sync activation status");
    }
  };

  // Edit client functions - now uses EditClientModal component
  const handleEditClick = async (client) => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/clients/${client.id}/details`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEditingClient(response.data);
    } catch (error) {
      // Fallback to basic client data if details endpoint fails
      setEditingClient(client);
    }
  };

  const handleEditSuccess = () => {
    setEditingClient(null);
    fetchData();
  };

  // Resend credentials
  const handleResendCredentials = async (client) => {
    if (!client.email) {
      toast.error("Client does not have an email address. Please update their profile first.");
      return;
    }
    
    if (!window.confirm(`Send login credentials to ${client.name} at ${client.email}? This will generate a new password and PIN.`)) return;
    
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(`${API}/clients/${client.id}/resend-credentials`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success(response.data.message || "Credentials sent to client's email");
    } catch (error) {
      console.error("Error resending credentials:", error);
      toast.error(error.response?.data?.detail || "Failed to send credentials");
    }
  };

  // Reset password
  const handleResetPassword = async (client) => {
    if (!client.email) {
      toast.error("Client does not have an email address. Please update their profile first.");
      return;
    }
    
    if (!window.confirm(`Reset password for ${client.name}? New credentials will be sent to ${client.email}`)) return;
    
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(`${API}/clients/${client.id}/reset-password`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success(response.data.message || "New password sent to client's email");
    } catch (error) {
      console.error("Error resetting password:", error);
      toast.error(error.response?.data?.detail || "Failed to reset password");
    }
  };

  // Deactivate client
  const handleDeactivate = async (client) => {
    if (!window.confirm(`Deactivate ${client.name}? They will no longer be able to login.`)) return;
    
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API}/clients/${client.id}/deactivate`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Client deactivated successfully");
      fetchData();
    } catch (error) {
      console.error("Error deactivating client:", error);
      toast.error("Failed to deactivate client");
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast.success("Copied to clipboard!");
  };

  const handleLinkSubbroker = async (clientId, subbrokerId) => {
    try {
      const token = localStorage.getItem("token");
      
      if (subbrokerId) {
        await axios.post(`${API}/clients/${clientId}/link-subbroker?subbroker_id=${subbrokerId}`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("Client linked to sub-broker");
      } else {
        await axios.post(`${API}/clients/${clientId}/unlink-subbroker`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("Client unlinked from sub-broker");
      }
      
      setLinkingClient(null);
      fetchData();
    } catch (error) {
      console.error("Error linking client:", error);
      toast.error(error.response?.data?.detail || "Failed to link client");
    }
  };

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.pan_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getSubbrokerName = (subbrokerId) => {
    const partner = partners.find(p => p.id === subbrokerId);
    return partner ? partner.name : null;
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
              <h1 className="text-2xl font-bold text-gray-800" data-testid="admin-clients-title">Admin - Clients</h1>
              <p className="text-sm text-gray-500 mt-1">Manage client accounts and link to sub-brokers</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  data-testid="search-clients"
                  placeholder="Search clients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
              <Button
                onClick={() => navigate('/broker/bulk-upload?tab=clients')}
                variant="outline"
                className="border-etihad-gold-300 text-etihad-gold-700 hover:bg-etihad-gold-50"
                data-testid="bulk-upload-btn"
              >
                <Upload className="h-4 w-4 mr-2" />
                Bulk Upload
              </Button>
              <Button
                onClick={() => setShowCreateModal(true)}
                className="bg-etihad-gold-700 hover:bg-etihad-gold-800"
                data-testid="create-client-btn"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Client
              </Button>
            </div>
          </div>
        </div>

        {/* Clients Table */}
        <div className="p-8">
          {loading ? (
            <p className="text-center text-gray-500 py-12">Loading...</p>
          ) : filteredClients.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">
                {searchQuery ? "No clients found" : "No clients created yet"}
              </p>
              {!searchQuery && (
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Client
                </Button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Client Name</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">PAN</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Contact</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Linked Sub-Broker</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="text-right py-4 px-6 text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((client) => {
                    const initials = client.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                    const linkedSubbroker = getSubbrokerName(client.linked_subbroker_id);
                    const isInactive = client.is_active === false;

                    return (
                      <tr key={client.id} className={`border-t border-gray-100 hover:bg-gray-50 ${isInactive ? 'opacity-60 bg-gray-50' : ''}`} data-testid={`client-row-${client.id}`}>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-medium text-sm ${isInactive ? 'bg-gray-200 text-gray-500' : 'bg-etihad-gold-100 text-etihad-gold-700'}`}>
                              {isInactive ? <UserX className="h-5 w-5" /> : initials}
                            </div>
                            <div>
                              <span className="font-medium block">{client.name}</span>
                              <span className="text-xs text-gray-500">{client.city}, {client.state}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6 font-mono text-sm">{client.pan_number}</td>
                        <td className="py-4 px-6">
                          <div className="text-sm">{client.email}</div>
                          <div className="text-xs text-gray-500">{client.mobile}</div>
                        </td>
                        <td className="py-4 px-6">
                          {linkingClient === client.id ? (
                            <div className="flex items-center gap-2">
                              <Select 
                                defaultValue={client.linked_subbroker_id || "none"} 
                                onValueChange={(v) => handleLinkSubbroker(client.id, v === "none" ? "" : v)}
                              >
                                <SelectTrigger className="w-40">
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Unlink</SelectItem>
                                  {partners.map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button variant="ghost" size="sm" onClick={() => setLinkingClient(null)}>
                                Cancel
                              </Button>
                            </div>
                          ) : linkedSubbroker ? (
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
                                {linkedSubbroker}
                              </span>
                              {!isInactive && (
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => setLinkingClient(client.id)}
                                  title="Change link"
                                >
                                  <Link2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          ) : (
                            !isInactive && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => setLinkingClient(client.id)}
                                data-testid={`link-subbroker-${client.id}`}
                              >
                                <Link2 className="h-3 w-3 mr-1" />
                                Link
                              </Button>
                            )
                          )}
                        </td>
                        <td className="py-4 px-6">
                          {isInactive ? (
                            <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full">Inactive</span>
                          ) : (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">Active</span>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center justify-end gap-1">
                            {isInactive ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleReactivate(client.id)}
                                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                title="Reactivate client"
                                data-testid={`reactivate-client-${client.id}`}
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditClick(client)}
                                  title="Edit client"
                                  data-testid={`edit-client-${client.id}`}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                
                                {/* Three dots menu */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" data-testid={`client-menu-${client.id}`}>
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem 
                                      onClick={() => handleResendCredentials(client)}
                                      className="cursor-pointer"
                                      data-testid={`resend-credentials-${client.id}`}
                                    >
                                      <Mail className="h-4 w-4 mr-2" />
                                      Resend Credentials
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onClick={() => handleResetPassword(client)}
                                      className="cursor-pointer"
                                      data-testid={`reset-password-${client.id}`}
                                    >
                                      <KeyRound className="h-4 w-4 mr-2" />
                                      Reset Password
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onClick={() => handleSyncActivation(client.id)}
                                      className="cursor-pointer text-blue-600"
                                      data-testid={`sync-activation-${client.id}`}
                                    >
                                      <RefreshCw className="h-4 w-4 mr-2" />
                                      Sync Activation
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                      onClick={() => handleDeactivate(client)}
                                      className="cursor-pointer text-etihad-gold-600"
                                      data-testid={`deactivate-client-${client.id}`}
                                    >
                                      <UserMinus className="h-4 w-4 mr-2" />
                                      Deactivate Client
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onClick={() => handleDelete(client.id, client.name)}
                                      className="cursor-pointer text-red-600"
                                      data-testid={`delete-client-${client.id}`}
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete Client
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
        <CreateClientModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchData();
          }}
          subbrokers={partners}
        />
      )}

      {/* Bulk Upload Modal */}
      {showBulkUploadModal && (
        <BulkUploadModal
          onClose={() => setShowBulkUploadModal(false)}
          onSuccess={() => {
            fetchData();
          }}
        />
      )}

      {/* Edit Client Modal */}
      {editingClient && (
        <EditClientModal
          client={editingClient}
          onClose={() => setEditingClient(null)}
          onSuccess={handleEditSuccess}
          subbrokers={partners}
        />
      )}
    </div>
  );
}
