import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import CreateClientModal from "@/components/CreateClientModal";
import { usePermissions } from "@/contexts/PermissionsContext";
import { 
  Plus, Search, Users, RefreshCw, Upload, MoreVertical, 
  Mail, Phone, CheckCircle, Clock, XCircle, Eye, Download,
  FileSpreadsheet, AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { logUserActivity } from "@/utils/activityLogger";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function SubBrokerClients() {
  const navigate = useNavigate();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [user, setUser] = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  
  // Permission checks
  const canCreateClient = hasPermission("user_client", "create");
  const canEditClient = hasPermission("user_client", "edit");
  const canBulkUpload = hasPermission("upload", "bulk_upload");
  
  // Bulk upload state
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadType, setUploadType] = useState("indian");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    document.title = "Kinntegraa | My Clients";
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "sub_broker") {
      navigate("/broker/dashboard");
      return;
    }
    
    setUser(parsedUser);
    fetchClients();
  }, [navigate]);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/sub-broker/clients`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setClients(response.data);
    } catch (error) {
      console.error("Error fetching clients:", error);
      toast.error("Failed to load clients");
    } finally {
      setLoading(false);
    }
  };

  const handleClientCreated = () => {
    setShowCreateModal(false);
    fetchClients();
  };

  const handleDownloadTemplate = async (type) => {
    try {
      const token = localStorage.getItem("token");
      const endpoint = type === "indian" ? "/bulk/template/clients-indian" : "/bulk/template/clients-foreign";
      
      const response = await axios.get(`${API}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: "blob"
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `client_template_${type}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Template downloaded successfully");
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Failed to download template");
    }
  };

  const handleBulkUpload = async () => {
    if (!uploadFile) {
      toast.error("Please select a file");
      return;
    }

    setUploading(true);
    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append("file", uploadFile);
      
      const endpoint = uploadType === "indian" 
        ? "/sub-broker/bulk/clients-indian" 
        : "/sub-broker/bulk/clients-foreign";
      
      const response = await axios.post(`${API}${endpoint}`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data"
        }
      });
      
      toast.success(`Successfully uploaded ${response.data.created || 0} clients`);
      setShowBulkUploadModal(false);
      setUploadFile(null);
      fetchClients();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(error.response?.data?.detail || "Failed to upload clients");
    } finally {
      setUploading(false);
    }
  };

  const filteredClients = clients.filter(client => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      client.name?.toLowerCase().includes(query) ||
      client.pan?.toLowerCase().includes(query) ||
      client.pan_number?.toLowerCase().includes(query) ||
      client.email?.toLowerCase().includes(query) ||
      client.phone?.includes(query) ||
      client.mobile?.includes(query)
    );
  });

  const getStatusBadge = (client) => {
    if (client.approval_status === "pending_approval") {
      return (
        <span className="flex items-center gap-1 px-2 py-1 bg-etihad-gold-100 text-etihad-gold-700 text-xs rounded-full">
          <Clock className="h-3 w-3" /> Pending Approval
        </span>
      );
    } else if (client.approval_status === "rejected") {
      return (
        <span className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full">
          <XCircle className="h-3 w-3" /> Rejected
        </span>
      );
    } else if (client.is_active === false) {
      return (
        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
          Inactive
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
        <CheckCircle className="h-3 w-3" /> Active
      </span>
    );
  };

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <SubBrokerSidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-800" data-testid="subbroker-clients-title">
                My Clients
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Manage your linked clients ({filteredClients.length} total)
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Search Bar - Inline */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search clients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-[200px]"
                  data-testid="client-search-input"
                />
              </div>
              <Button
                variant="outline"
                onClick={fetchClients}
                data-testid="refresh-clients-btn"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              {canBulkUpload && (
                <Button
                  variant="outline"
                  onClick={() => setShowBulkUploadModal(true)}
                  data-testid="bulk-upload-btn"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Bulk Upload
                </Button>
              )}
              {canCreateClient && (
                <Button
                  onClick={() => setShowCreateModal(true)}
                  className="bg-etihad-gold-700 hover:bg-etihad-gold-800"
                  data-testid="create-client-btn"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Client
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Clients Table */}
        <div className="p-4 md:p-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-etihad-gold-600" />
            </div>
          ) : clients.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">No clients linked yet</p>
              <div className="flex gap-2 justify-center">
                {canCreateClient && (
                  <Button onClick={() => setShowCreateModal(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Client
                  </Button>
                )}
                {canBulkUpload && (
                  <Button variant="outline" onClick={() => setShowBulkUploadModal(true)}>
                    <Upload className="h-4 w-4 mr-2" />
                    Bulk Upload
                  </Button>
                )}
              </div>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No clients match your search</p>
              <Button variant="outline" onClick={() => setSearchQuery("")}>
                Clear Search
              </Button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">PAN</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Opportunities</th>
                      <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredClients.map((client) => (
                      <tr key={client.id} className="hover:bg-gray-50" data-testid={`client-row-${client.id}`}>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-etihad-maroon-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                              {client.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'CL'}
                            </div>
                            <div>
                              <p className="font-medium text-gray-800">{client.name}</p>
                              <p className="text-xs text-gray-500">{client.city || ''}{client.state ? `, ${client.state}` : ''}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-sm text-gray-700">{client.pan || client.pan_number || '-'}</span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="space-y-1">
                            {client.email && (
                              <div className="flex items-center gap-1 text-sm text-gray-600">
                                <Mail className="h-3 w-3 text-gray-400" />
                                <span className="truncate max-w-[150px]">{client.email}</span>
                              </div>
                            )}
                            {(client.phone || client.mobile) && (
                              <div className="flex items-center gap-1 text-sm text-gray-600">
                                <Phone className="h-3 w-3 text-gray-400" />
                                <span>{client.phone || client.mobile}</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1">
                            {client.opportunities?.includes('bonds') && (
                              <span className="px-2 py-0.5 bg-etihad-gold-100 text-etihad-gold-700 text-xs rounded">Bonds</span>
                            )}
                            {client.opportunities?.includes('real_estate') && (
                              <span className="px-2 py-0.5 bg-pink-100 text-pink-700 text-xs rounded">Real Estate</span>
                            )}
                            {client.opportunities?.includes('gift_city') && (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">GIFT City</span>
                            )}
                            {(!client.opportunities || client.opportunities.length === 0) && (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {getStatusBadge(client)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" data-testid={`client-actions-${client.id}`}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => navigate(`/sub-broker/clients/${client.id}`)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Client Modal - Reuse the broker's modal */}
      {showCreateModal && (
        <CreateClientModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleClientCreated}
          subbrokers={[]}
          isSubBrokerMode={true}
        />
      )}

      {/* Bulk Upload Modal */}
      <Dialog open={showBulkUploadModal} onOpenChange={setShowBulkUploadModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-etihad-gold-600" />
              Bulk Upload Clients
            </DialogTitle>
            <DialogDescription>
              Upload multiple clients at once using an Excel template. Clients will be pending broker approval.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Template Selection */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Step 1: Download Template</p>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleDownloadTemplate("indian")}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Indian Passport
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleDownloadTemplate("foreign")}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Foreign Passport
                </Button>
              </div>
            </div>

            {/* Upload Type Selection */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Step 2: Select Client Type</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setUploadType("indian")}
                  className={`flex-1 p-3 rounded-lg border-2 transition-all ${
                    uploadType === "indian" 
                      ? "border-etihad-gold-500 bg-etihad-gold-50" 
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <p className="font-medium text-gray-800">Indian Passport</p>
                  <p className="text-xs text-gray-500">Residents & NRIs</p>
                </button>
                <button
                  onClick={() => setUploadType("foreign")}
                  className={`flex-1 p-3 rounded-lg border-2 transition-all ${
                    uploadType === "foreign" 
                      ? "border-etihad-gold-500 bg-etihad-gold-50" 
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <p className="font-medium text-gray-800">Foreign Passport</p>
                  <p className="text-xs text-gray-500">Non-Indian nationals</p>
                </button>
              </div>
            </div>

            {/* File Upload */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Step 3: Upload Filled Template</p>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="bulk-upload-file"
                />
                <label htmlFor="bulk-upload-file" className="cursor-pointer">
                  <FileSpreadsheet className="h-10 w-10 text-gray-400 mx-auto mb-2" />
                  {uploadFile ? (
                    <p className="text-sm text-green-600 font-medium">{uploadFile.name}</p>
                  ) : (
                    <p className="text-sm text-gray-500">Click to select Excel file</p>
                  )}
                </label>
              </div>
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2 p-3 bg-etihad-gold-50 border border-etihad-gold-200 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-etihad-gold-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-etihad-gold-800">
                <p className="font-medium">Note:</p>
                <p>All uploaded clients will require broker approval before they become active.</p>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkUploadModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleBulkUpload} 
              disabled={!uploadFile || uploading}
              className="bg-etihad-gold-700 hover:bg-etihad-gold-800"
            >
              {uploading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Clients
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
