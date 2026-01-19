import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import CreateClientModal from "@/components/CreateClientModal";
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

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
];
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
  
  // Edit modal state
  const [editingClient, setEditingClient] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [editLoading, setEditLoading] = useState(false);
  
  // Credentials modal state
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [credentials, setCredentials] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

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

  // Edit client functions
  const handleEditClick = async (client) => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/clients/${client.id}/details`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Load UCC list for editing (handle both old ucc and new ucc_list)
      const clientData = { ...response.data };
      if (clientData.ucc_list && Array.isArray(clientData.ucc_list) && clientData.ucc_list.length > 0) {
        clientData.uccs = [...clientData.ucc_list];
      } else if (clientData.ucc && typeof clientData.ucc === 'string') {
        clientData.uccs = [clientData.ucc];
      } else {
        clientData.uccs = [''];
      }
      
      setEditFormData(clientData);
      setEditingClient(client);
    } catch (error) {
      // Fallback to basic client data if details endpoint fails
      const clientData = { ...client };
      if (clientData.ucc_list && Array.isArray(clientData.ucc_list) && clientData.ucc_list.length > 0) {
        clientData.uccs = [...clientData.ucc_list];
      } else if (clientData.ucc && typeof clientData.ucc === 'string') {
        clientData.uccs = [clientData.ucc];
      } else {
        clientData.uccs = [''];
      }
      
      setEditFormData(clientData);
      setEditingClient(client);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditLoading(true);
    try {
      const token = localStorage.getItem("token");
      
      // Prepare form data with UCCs handling - send as ucc_list array
      const submitData = { ...editFormData };
      if (editFormData.uccs) {
        // Filter out empty UCCs
        const validUccs = editFormData.uccs.filter(ucc => ucc && ucc.trim() !== '');
        submitData.ucc_list = validUccs.length > 0 ? validUccs : [''];
        delete submitData.uccs; // Remove the temporary uccs array
      }
      // Remove old ucc field if present
      delete submitData.ucc;
      
      await axios.put(`${API}/clients/${editingClient.id}`, submitData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Client updated successfully");
      setEditingClient(null);
      fetchData();
    } catch (error) {
      console.error("Error updating client:", error);
      toast.error(error.response?.data?.detail || "Failed to update client");
    } finally {
      setEditLoading(false);
    }
  };

  // Resend credentials
  const handleResendCredentials = async (client) => {
    if (!window.confirm(`Resend login credentials to ${client.name}? This will generate a new password and PIN.`)) return;
    
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(`${API}/clients/${client.id}/resend-credentials`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setCredentials(response.data.credentials);
      setShowCredentialsModal(true);
      
      if (response.data.email_sent) {
        toast.success("Credentials sent to client's email");
      } else {
        toast.warning("Email could not be sent. Please share credentials manually.");
      }
    } catch (error) {
      console.error("Error resending credentials:", error);
      toast.error("Failed to resend credentials");
    }
  };

  // Reset password
  const handleResetPassword = async (client) => {
    if (!window.confirm(`Reset password for ${client.name}?`)) return;
    
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(`${API}/clients/${client.id}/reset-password`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setCredentials({
        name: client.name,
        pan: client.pan_number,
        password: response.data.new_password,
        email: client.email
      });
      setShowCredentialsModal(true);
      
      if (response.data.email_sent) {
        toast.success("New password sent to client's email");
      } else {
        toast.warning("Email could not be sent. Please share password manually.");
      }
    } catch (error) {
      console.error("Error resetting password:", error);
      toast.error("Failed to reset password");
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
                className="border-amber-300 text-amber-700 hover:bg-amber-50"
                data-testid="bulk-upload-btn"
              >
                <Upload className="h-4 w-4 mr-2" />
                Bulk Upload
              </Button>
              <Button
                onClick={() => setShowCreateModal(true)}
                className="bg-amber-700 hover:bg-amber-800"
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
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-medium text-sm ${isInactive ? 'bg-gray-200 text-gray-500' : 'bg-amber-100 text-amber-700'}`}>
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
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                      onClick={() => handleDeactivate(client)}
                                      className="cursor-pointer text-amber-600"
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-semibold">Edit Client - {editingClient.name}</h2>
              <Button variant="ghost" size="sm" onClick={() => setEditingClient(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <form onSubmit={handleEditSubmit} className="p-4 space-y-4">
              {/* Personal Details */}
              <div className="space-y-3">
                <h3 className="font-medium text-gray-700 border-b pb-2">Personal Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Name *</Label>
                    <Input
                      value={editFormData.name || ''}
                      onChange={(e) => setEditFormData({...editFormData, name: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <Label>PAN Number</Label>
                    <Input value={editFormData.pan_number || ''} disabled className="bg-gray-100" />
                  </div>
                  <div>
                    <Label>Email *</Label>
                    <Input
                      type="email"
                      value={editFormData.email || ''}
                      onChange={(e) => setEditFormData({...editFormData, email: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <Label>Mobile *</Label>
                    <Input
                      value={editFormData.mobile || ''}
                      onChange={(e) => setEditFormData({...editFormData, mobile: e.target.value})}
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>UCCs</Label>
                    <div className="space-y-2">
                      {(editFormData.uccs || [editFormData.ucc || '']).map((ucc, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Input
                            value={ucc}
                            onChange={(e) => {
                              const newUccs = [...(editFormData.uccs || [editFormData.ucc || ''])];
                              newUccs[index] = e.target.value;
                              setEditFormData({...editFormData, uccs: newUccs});
                            }}
                            placeholder={`UCC ${index + 1}`}
                          />
                          {index > 0 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const newUccs = [...(editFormData.uccs || [editFormData.ucc || ''])];
                                newUccs.splice(index, 1);
                                setEditFormData({...editFormData, uccs: newUccs});
                              }}
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const currentUccs = editFormData.uccs || [editFormData.ucc || ''];
                          setEditFormData({...editFormData, uccs: [...currentUccs, '']});
                        }}
                        className="w-full"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add UCC
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label>Occupation</Label>
                    <Input
                      value={editFormData.occupation || ''}
                      onChange={(e) => setEditFormData({...editFormData, occupation: e.target.value})}
                    />
                  </div>
                </div>
              </div>
              
              {/* Address Details */}
              <div className="space-y-3">
                <h3 className="font-medium text-gray-700 border-b pb-2">Address Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label>Address Line 1</Label>
                    <Input
                      value={editFormData.address_line1 || ''}
                      onChange={(e) => setEditFormData({...editFormData, address_line1: e.target.value})}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Address Line 2</Label>
                    <Input
                      value={editFormData.address_line2 || ''}
                      onChange={(e) => setEditFormData({...editFormData, address_line2: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>City</Label>
                    <Input
                      value={editFormData.city || ''}
                      onChange={(e) => setEditFormData({...editFormData, city: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>State</Label>
                    <Select 
                      value={editFormData.state || ''} 
                      onValueChange={(v) => setEditFormData({...editFormData, state: v})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select State" />
                      </SelectTrigger>
                      <SelectContent>
                        {INDIAN_STATES.map(state => (
                          <SelectItem key={state} value={state}>{state}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Pincode</Label>
                    <Input
                      value={editFormData.pincode || ''}
                      onChange={(e) => setEditFormData({...editFormData, pincode: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>Country</Label>
                    <Input
                      value={editFormData.country || 'India'}
                      onChange={(e) => setEditFormData({...editFormData, country: e.target.value})}
                    />
                  </div>
                </div>
              </div>
              
              {/* Bank Details */}
              <div className="space-y-3">
                <h3 className="font-medium text-gray-700 border-b pb-2">Bank Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Bank Name</Label>
                    <Input
                      value={editFormData.bank_name || ''}
                      onChange={(e) => setEditFormData({...editFormData, bank_name: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>Account Number</Label>
                    <Input
                      value={editFormData.account_number || ''}
                      onChange={(e) => setEditFormData({...editFormData, account_number: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>Branch</Label>
                    <Input
                      value={editFormData.branch || ''}
                      onChange={(e) => setEditFormData({...editFormData, branch: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>IFSC Code</Label>
                    <Input
                      value={editFormData.ifsc_code || ''}
                      onChange={(e) => setEditFormData({...editFormData, ifsc_code: e.target.value})}
                    />
                  </div>
                </div>
              </div>
              
              {/* Sub-broker Assignment */}
              <div className="space-y-3">
                <h3 className="font-medium text-gray-700 border-b pb-2">Sub-broker Assignment</h3>
                <div>
                  <Label>Linked Sub-broker</Label>
                  <Select 
                    value={editFormData.linked_subbroker_id || 'none'} 
                    onValueChange={(v) => setEditFormData({...editFormData, linked_subbroker_id: v === 'none' ? null : v})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Sub-broker" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Sub-broker</SelectItem>
                      {partners.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Form Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setEditingClient(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={editLoading} className="bg-amber-700 hover:bg-amber-800">
                  {editLoading ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Credentials Modal */}
      {showCredentialsModal && credentials && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md">
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-4 text-white rounded-t-lg">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <KeyRound className="h-6 w-6" />
                Client Credentials
              </h2>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Share these credentials with <strong>{credentials.name}</strong>:
              </p>
              
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                {/* PAN */}
                <div className="flex items-center justify-between bg-white rounded-md p-3 border">
                  <div>
                    <p className="text-xs text-gray-500 uppercase">PAN (Username)</p>
                    <p className="font-mono font-semibold">{credentials.pan}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(credentials.pan, 'pan')}>
                    {copiedField === 'pan' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                
                {/* Password */}
                <div className="flex items-center justify-between bg-white rounded-md p-3 border">
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Password</p>
                    <p className="font-mono font-semibold">{credentials.password}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(credentials.password, 'password')}>
                    {copiedField === 'password' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                
                {/* PIN (if available) */}
                {credentials.pin && (
                  <div className="flex items-center justify-between bg-white rounded-md p-3 border">
                    <div>
                      <p className="text-xs text-gray-500 uppercase">PIN</p>
                      <p className="font-mono font-semibold">{credentials.pin}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(credentials.pin, 'pin')}>
                      {copiedField === 'pin' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                )}
              </div>
              
              <div className="flex justify-end">
                <Button onClick={() => { setShowCredentialsModal(false); setCredentials(null); }}>
                  Done
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
