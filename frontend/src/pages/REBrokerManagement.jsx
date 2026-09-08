import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import PartnersTabs from "@/components/PartnersTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Search, Building2, RefreshCw, MoreVertical, Mail, Phone, MapPin,
  Edit2, Trash2, Award, Globe, ArrowUpDown, ArrowUp, ArrowDown,
  Eye, Plus, Upload
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function REBrokerManagement() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [reBrokers, setReBrokers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Search and Sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState("full_name");
  const [sortDirection, setSortDirection] = useState("asc");
  
  // Modal states
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedBroker, setSelectedBroker] = useState(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  
  // New Real Estate Partner form state — aligned with bulk upload template
  const [newBroker, setNewBroker] = useState({
    full_name: "",
    email: "",
    mobile_number: "",
    company_name: "",
    rera_license_number: "",
    rera_expiry_date: "",
    emirate: "Dubai",
    office_address: "",
    specialization: "",
    years_of_experience: "",
    team_size: "",
    primary_areas: "",
    website: "",
    linkedin_profile: "",
    about: ""
  });

  // Edit Real Estate Partner form state
  const [editBroker, setEditBroker] = useState({
    full_name: "",
    email: "",
    mobile_number: "",
    company_name: "",
    rera_number: "",
    brn_number: "",
    specialization: "",
    years_of_experience: "",
    areas_of_operation: "",
    about: ""
  });

  // Set page title
  useEffect(() => {
    document.title = "Kinntegraa | Real Estate Partners";
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
    fetchReBrokers();
  }, [navigate]);

  const fetchReBrokers = async () => {
    try {
      const token = localStorage.getItem("token");
      // Fetch all Real Estate Partners (both applied and approved)
      const [appliedRes, approvedRes] = await Promise.all([
        axios.get(`${API}/re-brokers?stage=applied`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/re-brokers?stage=approved`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      
      const allBrokers = [...(appliedRes.data || []), ...(approvedRes.data || [])];
      setReBrokers(allBrokers);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching Real Estate Partners:", error);
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteReason.trim()) {
      toast.error("Please provide a reason for deletion");
      return;
    }
    
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/re-brokers/${selectedBroker.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { reason: deleteReason }
      });
      toast.success("Real Estate Partner deleted successfully");
      setShowDeleteModal(false);
      setSelectedBroker(null);
      setDeleteReason("");
      fetchReBrokers();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete Real Estate Partner");
    }
  };

  const handleCreateBroker = async () => {
    // Validate required fields (aligned with template: Full Name, Email, Mobile, Company, RERA License)
    if (!newBroker.full_name || !newBroker.email || !newBroker.mobile_number ||
        !newBroker.company_name || !newBroker.rera_license_number) {
      toast.error("Please fill in all required fields (Name, Email, Mobile, Company, RERA License)");
      return;
    }
    
    setCreating(true);
    try {
      const token = localStorage.getItem("token");
      
      await axios.post(`${API}/re-brokers`, newBroker, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success("Real Estate Partner created successfully!");
      setShowCreateModal(false);
      setNewBroker({
        full_name: "",
        email: "",
        mobile_number: "",
        company_name: "",
        rera_license_number: "",
        rera_expiry_date: "",
        emirate: "Dubai",
        office_address: "",
        specialization: "",
        years_of_experience: "",
        team_size: "",
        primary_areas: "",
        website: "",
        linkedin_profile: "",
        about: ""
      });
      fetchReBrokers();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to create Real Estate Partner");
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (broker) => {
    setSelectedBroker(broker);
    setEditBroker({
      full_name: broker.full_name || "",
      email: broker.email || "",
      mobile_number: broker.mobile_number || "",
      company_name: broker.company_name || "",
      rera_number: broker.rera_number || broker.rera_license_number || "",
      brn_number: broker.brn_number || "",
      specialization: broker.specialization || "",
      years_of_experience: broker.years_of_experience || "",
      areas_of_operation: broker.areas_of_operation || "",
      about: broker.about || ""
    });
    setShowEditModal(true);
  };

  const handleEditBroker = async () => {
    if (!editBroker.full_name || !editBroker.email || !editBroker.mobile_number) {
      toast.error("Please fill in all required fields (Name, Email, Mobile)");
      return;
    }
    
    setEditing(true);
    try {
      const token = localStorage.getItem("token");
      
      await axios.put(`${API}/re-brokers/${selectedBroker.id}`, editBroker, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success("Real Estate Partner updated successfully!");
      setShowEditModal(false);
      setSelectedBroker(null);
      fetchReBrokers();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update Real Estate Partner");
    } finally {
      setEditing(false);
    }
  };

  const getStatusBadge = (stage) => {
    if (stage === 'approved') {
      return <Badge className="bg-green-100 text-green-700">Active</Badge>;
    }
    return <Badge className="bg-amber-100 text-amber-700">Pending</Badge>;
  };

  // Search filter
  const filteredBrokers = reBrokers.filter(broker => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      broker.full_name?.toLowerCase().includes(query) ||
      broker.company_name?.toLowerCase().includes(query) ||
      broker.email?.toLowerCase().includes(query) ||
      broker.rera_license_number?.toLowerCase().includes(query) ||
      broker.emirate?.toLowerCase().includes(query)
    );
  });

  // Sort
  const sortedBrokers = [...filteredBrokers].sort((a, b) => {
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

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-etihad-gold-500 to-etihad-gold-600 rounded-lg flex items-center justify-center">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-gray-800" data-testid="admin-rebrokers-title">Partners</h1>
                <p className="text-sm text-gray-500 mt-1">Manage your MFD/RIA and Real Estate partners</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search Real Estate Partners..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-[200px]"
                  data-testid="rebroker-search-input"
                />
              </div>
              <Button
                variant="outline"
                onClick={fetchReBrokers}
                data-testid="refresh-rebrokers-btn"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/broker/bulk-upload?tab=re-brokers')}
                className="border-etihad-gold-300 text-etihad-gold-700 hover:bg-etihad-gold-50"
                data-testid="bulk-upload-rebrokers-btn"
              >
                <Upload className="h-4 w-4 mr-2" />
                Bulk Upload
              </Button>
              <Button
                onClick={() => setShowCreateModal(true)}
                className="bg-etihad-gold-700 hover:bg-etihad-gold-800"
                data-testid="add-rebroker-btn"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Real Estate Partner
              </Button>
            </div>
          </div>
        </div>

        {/* Partners Tabs (inside the Partners page, below header) */}
        <PartnersTabs activeTab="real-estate" />

        {/* Real Estate Partners Table */}
        <div className="p-4 md:p-8">
          {loading ? (
            <p className="text-center text-gray-500 py-12">Loading...</p>
          ) : reBrokers.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">No Real Estate Partners yet</p>
              <p className="text-sm text-gray-400">Real Estate Partner applications will appear here after they sign up</p>
            </div>
          ) : filteredBrokers.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No Real Estate Partners match your search</p>
              <Button variant="outline" onClick={() => setSearchQuery("")}>
                Clear Search
              </Button>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th 
                      className="text-left py-4 px-4 md:px-6 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort("full_name")}
                    >
                      <div className="flex items-center gap-2">
                        Broker Name
                        <SortIcon field="full_name" />
                      </div>
                    </th>
                    <th 
                      className="text-left py-4 px-4 md:px-6 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort("company_name")}
                    >
                      <div className="flex items-center gap-2">
                        Company
                        <SortIcon field="company_name" />
                      </div>
                    </th>
                    <th 
                      className="text-left py-4 px-4 md:px-6 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort("rera_license_number")}
                    >
                      <div className="flex items-center gap-2">
                        RERA License
                        <SortIcon field="rera_license_number" />
                      </div>
                    </th>
                    <th 
                      className="text-left py-4 px-4 md:px-6 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort("emirate")}
                    >
                      <div className="flex items-center gap-2">
                        Emirate
                        <SortIcon field="emirate" />
                      </div>
                    </th>
                    <th 
                      className="text-left py-4 px-4 md:px-6 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort("stage")}
                    >
                      <div className="flex items-center gap-2">
                        Status
                        <SortIcon field="stage" />
                      </div>
                    </th>
                    <th className="text-left py-4 px-4 md:px-6 text-xs font-medium text-gray-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedBrokers.map((broker) => (
                    <tr key={broker.id} className="hover:bg-gray-50" data-testid={`rebroker-row-${broker.id}`}>
                      <td className="py-4 px-4 md:px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-etihad-gold-100 rounded-full flex items-center justify-center text-etihad-gold-700 font-medium">
                            {broker.full_name?.charAt(0)?.toUpperCase() || "R"}
                          </div>
                          <div>
                            <p className="font-medium text-gray-800 text-sm">{broker.full_name}</p>
                            <p className="text-xs text-gray-500">{broker.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 md:px-6">
                        <p className="text-sm text-gray-700">{broker.company_name}</p>
                        {broker.mobile_number && (
                          <p className="text-xs text-gray-500">{broker.mobile_number}</p>
                        )}
                      </td>
                      <td className="py-4 px-4 md:px-6">
                        <p className="text-sm font-mono text-gray-700">{broker.rera_license_number || "N/A"}</p>
                        {broker.rera_expiry_date && (
                          <p className="text-xs text-gray-500">Exp: {formatDate(broker.rera_expiry_date)}</p>
                        )}
                      </td>
                      <td className="py-4 px-4 md:px-6">
                        <p className="text-sm text-gray-700">{broker.emirate || "Dubai"}</p>
                      </td>
                      <td className="py-4 px-4 md:px-6">
                        {getStatusBadge(broker.stage)}
                      </td>
                      <td className="py-4 px-4 md:px-6">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" data-testid={`rebroker-actions-${broker.id}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setSelectedBroker(broker); setShowDetailModal(true); }}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEditModal(broker)}>
                              <Edit2 className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            {broker.website && (
                              <DropdownMenuItem onClick={() => window.open(broker.website, '_blank')}>
                                <Globe className="h-4 w-4 mr-2" />
                                Visit Website
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => { setSelectedBroker(broker); setShowDeleteModal(true); }}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-etihad-gold-600" />
              Real Estate Partner Details
            </DialogTitle>
          </DialogHeader>
          {selectedBroker && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3 pb-4 border-b">
                <div className="w-14 h-14 bg-etihad-gold-100 rounded-full flex items-center justify-center text-etihad-gold-700 font-bold text-xl">
                  {selectedBroker.full_name?.charAt(0)?.toUpperCase() || "R"}
                </div>
                <div>
                  <p className="font-semibold text-lg">{selectedBroker.full_name}</p>
                  <p className="text-sm text-gray-500">{selectedBroker.company_name}</p>
                  {getStatusBadge(selectedBroker.stage)}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500 text-xs uppercase">Email</p>
                  <p className="font-medium flex items-center gap-1">
                    <Mail className="h-3 w-3 text-gray-400" />
                    {selectedBroker.email}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs uppercase">Mobile</p>
                  <p className="font-medium flex items-center gap-1">
                    <Phone className="h-3 w-3 text-gray-400" />
                    {selectedBroker.mobile_number || "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs uppercase">RERA License</p>
                  <p className="font-medium flex items-center gap-1">
                    <Award className="h-3 w-3 text-gray-400" />
                    {selectedBroker.rera_license_number || "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs uppercase">Emirate</p>
                  <p className="font-medium flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-gray-400" />
                    {selectedBroker.emirate || "Dubai"}
                  </p>
                </div>
                {selectedBroker.specialization && (
                  <div className="col-span-2">
                    <p className="text-gray-500 text-xs uppercase">Specialization</p>
                    <p className="font-medium">{selectedBroker.specialization}</p>
                  </div>
                )}
                {selectedBroker.years_of_experience && (
                  <div>
                    <p className="text-gray-500 text-xs uppercase">Experience</p>
                    <p className="font-medium">{selectedBroker.years_of_experience}</p>
                  </div>
                )}
                {selectedBroker.team_size && (
                  <div>
                    <p className="text-gray-500 text-xs uppercase">Team Size</p>
                    <p className="font-medium">{selectedBroker.team_size} agents</p>
                  </div>
                )}
                {selectedBroker.primary_areas && (
                  <div className="col-span-2">
                    <p className="text-gray-500 text-xs uppercase">Primary Areas</p>
                    <p className="font-medium">{selectedBroker.primary_areas}</p>
                  </div>
                )}
                <div>
                  <p className="text-gray-500 text-xs uppercase">Applied On</p>
                  <p className="font-medium">{formatDate(selectedBroker.created_at)}</p>
                </div>
                {selectedBroker.activated_at && (
                  <div>
                    <p className="text-gray-500 text-xs uppercase">Activated On</p>
                    <p className="font-medium">{formatDate(selectedBroker.activated_at)}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Real Estate Partner</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedBroker?.full_name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Label>Reason for deletion *</Label>
            <Textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Please provide a reason..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDeleteModal(false); setSelectedBroker(null); setDeleteReason(""); }}>
              Cancel
            </Button>
            <Button onClick={handleDelete} variant="destructive">
              Delete Broker
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Real Estate Partner Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-etihad-gold-600" />
              Add Real Estate Partner
            </DialogTitle>
            <DialogDescription>
              Create a new Real Estate Partner account
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            {/* Personal Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wider">Personal Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Full Name *</Label>
                  <Input
                    value={newBroker.full_name}
                    onChange={(e) => setNewBroker({...newBroker, full_name: e.target.value})}
                    placeholder="John Smith"
                    data-testid="rep-full-name-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={newBroker.email}
                    onChange={(e) => setNewBroker({...newBroker, email: e.target.value})}
                    placeholder="john@example.com"
                    data-testid="rep-email-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mobile Number *</Label>
                  <Input
                    value={newBroker.mobile_number}
                    onChange={(e) => setNewBroker({...newBroker, mobile_number: e.target.value})}
                    placeholder="+971501234567"
                    data-testid="rep-mobile-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Company Name *</Label>
                  <Input
                    value={newBroker.company_name}
                    onChange={(e) => setNewBroker({...newBroker, company_name: e.target.value})}
                    placeholder="ABC Realty LLC"
                    data-testid="rep-company-input"
                  />
                </div>
              </div>
            </div>

            {/* Licensing Information */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wider">Licensing Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>RERA License Number *</Label>
                  <Input
                    value={newBroker.rera_license_number}
                    onChange={(e) => setNewBroker({...newBroker, rera_license_number: e.target.value})}
                    placeholder="RERA-12345"
                    className="font-mono"
                    data-testid="rep-rera-license-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>RERA Expiry Date</Label>
                  <Input
                    type="date"
                    value={newBroker.rera_expiry_date}
                    onChange={(e) => setNewBroker({...newBroker, rera_expiry_date: e.target.value})}
                    data-testid="rep-rera-expiry-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Emirate</Label>
                  <Select 
                    value={newBroker.emirate} 
                    onValueChange={(value) => setNewBroker({...newBroker, emirate: value})}
                  >
                    <SelectTrigger data-testid="rep-emirate-select">
                      <SelectValue placeholder="Select emirate" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Dubai">Dubai</SelectItem>
                      <SelectItem value="Abu Dhabi">Abu Dhabi</SelectItem>
                      <SelectItem value="Sharjah">Sharjah</SelectItem>
                      <SelectItem value="Ajman">Ajman</SelectItem>
                      <SelectItem value="Ras Al Khaimah">Ras Al Khaimah</SelectItem>
                      <SelectItem value="Fujairah">Fujairah</SelectItem>
                      <SelectItem value="Umm Al Quwain">Umm Al Quwain</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Office Address</Label>
                  <Input
                    value={newBroker.office_address}
                    onChange={(e) => setNewBroker({...newBroker, office_address: e.target.value})}
                    placeholder="Office 101, Business Bay"
                    data-testid="rep-office-address-input"
                  />
                </div>
              </div>
            </div>

            {/* Professional Information */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wider">Professional Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Specialization *</Label>
                  <Select 
                    value={newBroker.specialization} 
                    onValueChange={(value) => setNewBroker({...newBroker, specialization: value})}
                  >
                    <SelectTrigger data-testid="rep-specialization-select">
                      <SelectValue placeholder="Select specialization" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Residential">Residential</SelectItem>
                      <SelectItem value="Commercial">Commercial</SelectItem>
                      <SelectItem value="Luxury">Luxury</SelectItem>
                      <SelectItem value="Off-Plan">Off-Plan</SelectItem>
                      <SelectItem value="Rental">Rental</SelectItem>
                      <SelectItem value="Mixed">Mixed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Years of Experience *</Label>
                  <Select 
                    value={newBroker.years_of_experience} 
                    onValueChange={(value) => setNewBroker({...newBroker, years_of_experience: value})}
                  >
                    <SelectTrigger data-testid="rep-years-select">
                      <SelectValue placeholder="Select experience" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0-2">0-2 Years</SelectItem>
                      <SelectItem value="2-5">2-5 Years</SelectItem>
                      <SelectItem value="5-10">5-10 Years</SelectItem>
                      <SelectItem value="10+">10+ Years</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Team Size</Label>
                  <Select 
                    value={newBroker.team_size} 
                    onValueChange={(value) => setNewBroker({...newBroker, team_size: value})}
                  >
                    <SelectTrigger data-testid="rep-team-size-select">
                      <SelectValue placeholder="Select team size" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1-5">1-5</SelectItem>
                      <SelectItem value="5-10">5-10</SelectItem>
                      <SelectItem value="10-20">10-20</SelectItem>
                      <SelectItem value="20+">20+</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Primary Areas of Operation</Label>
                  <Input
                    value={newBroker.primary_areas}
                    onChange={(e) => setNewBroker({...newBroker, primary_areas: e.target.value})}
                    placeholder="Dubai Marina, Downtown Dubai"
                    data-testid="rep-primary-areas-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Website</Label>
                  <Input
                    value={newBroker.website}
                    onChange={(e) => setNewBroker({...newBroker, website: e.target.value})}
                    placeholder="www.abcrealty.ae"
                    data-testid="rep-website-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>LinkedIn Profile</Label>
                  <Input
                    value={newBroker.linkedin_profile}
                    onChange={(e) => setNewBroker({...newBroker, linkedin_profile: e.target.value})}
                    placeholder="linkedin.com/in/johnsmith"
                    data-testid="rep-linkedin-input"
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>About</Label>
                  <Textarea
                    value={newBroker.about}
                    onChange={(e) => setNewBroker({...newBroker, about: e.target.value})}
                    placeholder="Brief description about the partner..."
                    rows={3}
                    data-testid="rep-about-input"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateBroker} 
              disabled={creating}
              className="bg-etihad-gold-700 hover:bg-etihad-gold-800"
              data-testid="create-rep-submit-btn"
            >
              {creating ? "Creating..." : "Create Real Estate Partner"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Real Estate Partner Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-etihad-gold-600" />
              Edit Real Estate Partner
            </DialogTitle>
            <DialogDescription>
              Update the Real Estate Partner's details below.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input
                  value={editBroker.full_name}
                  onChange={(e) => setEditBroker({...editBroker, full_name: e.target.value})}
                  placeholder="Enter full name"
                />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={editBroker.email}
                  onChange={(e) => setEditBroker({...editBroker, email: e.target.value})}
                  placeholder="email@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Mobile Number *</Label>
                <Input
                  value={editBroker.mobile_number}
                  onChange={(e) => setEditBroker({...editBroker, mobile_number: e.target.value})}
                  placeholder="+971 50 XXX XXXX"
                />
              </div>
              <div className="space-y-2">
                <Label>Company Name</Label>
                <Input
                  value={editBroker.company_name}
                  onChange={(e) => setEditBroker({...editBroker, company_name: e.target.value})}
                  placeholder="Real Estate Company LLC"
                />
              </div>
              <div className="space-y-2">
                <Label>RERA Number</Label>
                <Input
                  value={editBroker.rera_number}
                  onChange={(e) => setEditBroker({...editBroker, rera_number: e.target.value})}
                  placeholder="RERA License Number"
                />
              </div>
              <div className="space-y-2">
                <Label>BRN Number</Label>
                <Input
                  value={editBroker.brn_number}
                  onChange={(e) => setEditBroker({...editBroker, brn_number: e.target.value})}
                  placeholder="Broker Registration Number"
                />
              </div>
              <div className="space-y-2">
                <Label>Specialization</Label>
                <Select 
                  value={editBroker.specialization}
                  onValueChange={(value) => setEditBroker({...editBroker, specialization: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select specialization" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Residential">Residential</SelectItem>
                    <SelectItem value="Commercial">Commercial</SelectItem>
                    <SelectItem value="Both">Both</SelectItem>
                    <SelectItem value="Off-Plan">Off-Plan</SelectItem>
                    <SelectItem value="Luxury">Luxury</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Years of Experience</Label>
                <Select 
                  value={editBroker.years_of_experience}
                  onValueChange={(value) => setEditBroker({...editBroker, years_of_experience: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select experience" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0-2">0-2 Years</SelectItem>
                    <SelectItem value="2-5">2-5 Years</SelectItem>
                    <SelectItem value="5-10">5-10 Years</SelectItem>
                    <SelectItem value="10+">10+ Years</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Areas of Operation</Label>
                <Input
                  value={editBroker.areas_of_operation}
                  onChange={(e) => setEditBroker({...editBroker, areas_of_operation: e.target.value})}
                  placeholder="Dubai Marina, Downtown, Palm Jumeirah"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>About</Label>
                <Textarea
                  value={editBroker.about}
                  onChange={(e) => setEditBroker({...editBroker, about: e.target.value})}
                  placeholder="Brief description about the broker..."
                  rows={3}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleEditBroker} 
              disabled={editing}
              className="bg-etihad-gold-700 hover:bg-etihad-gold-800"
            >
              {editing ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
