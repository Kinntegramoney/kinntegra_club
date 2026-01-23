import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import Sidebar from "@/components/Sidebar";
import CreateClientModal from "@/components/CreateClientModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  Search, Plus, Users, MapPin, Calendar, Eye, Edit2, 
  CheckCircle, XCircle, Clock, MoreVertical, FileText,
  UserPlus, Building2, Briefcase
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STATUS_CONFIG = {
  pending_approval: { label: "Pending", color: "bg-yellow-100 text-yellow-800", icon: Clock },
  approved: { label: "Approved", color: "bg-green-100 text-green-800", icon: CheckCircle },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-800", icon: XCircle },
  active: { label: "Active", color: "bg-green-100 text-green-800", icon: CheckCircle },
};

export default function LeadManagement() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("leads");
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewLeadModal, setShowNewLeadModal] = useState(false);

  useEffect(() => {
    document.title = "Kinntegraa | Lead Management";
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    if (!["broker", "sub_broker"].includes(parsedUser.role)) {
      navigate("/client/dashboard");
      return;
    }
    
    setUser(parsedUser);
    fetchLeads();
  }, [navigate]);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      
      // Fetch clients created by this sub-broker that are pending approval
      const response = await axios.get(`${API}/clients`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Filter to show pending approvals and recent leads
      const allClients = response.data || [];
      const leadsData = allClients.map(client => ({
        id: client.id,
        family_name: client.name,
        associate_name: client.linked_subbroker_name || "-",
        location: client.city || client.country_of_residency || "-",
        date: client.created_at,
        status: client.approval_status || (client.is_active ? "active" : "pending_approval"),
        email: client.email,
        mobile: client.mobile,
        pan: client.pan_number || client.photo_id,
      }));
      
      setLeads(leadsData);
    } catch (error) {
      console.error("Error fetching leads:", error);
      toast.error("Failed to load leads");
    } finally {
      setLoading(false);
    }
  };

  const filteredLeads = leads.filter(lead => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return lead.family_name?.toLowerCase().includes(query) ||
             lead.location?.toLowerCase().includes(query) ||
             lead.pan?.toLowerCase().includes(query);
    }
    return true;
  });

  const pendingLeads = filteredLeads.filter(l => l.status === "pending_approval");
  const approvedLeads = filteredLeads.filter(l => l.status === "approved" || l.status === "active");

  const getSidebar = () => {
    if (user?.role === "broker") return <Sidebar user={user} />;
    return <SubBrokerSidebar user={user} />;
  };

  const getStatusBadge = (status) => {
    const config = STATUS_CONFIG[status] || { label: status, color: "bg-gray-100 text-gray-800", icon: Clock };
    const Icon = config.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </span>
    );
  };

  const handleNewLeadSuccess = () => {
    setShowNewLeadModal(false);
    fetchLeads();
    toast.success("New lead created successfully!");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {getSidebar()}
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-800">Lead Management</h1>
                <p className="text-sm text-gray-500">Manage client leads and approvals</p>
              </div>
              <Button 
                onClick={() => setShowNewLeadModal(true)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                NEW LEAD
              </Button>
            </div>
          </div>
          
          {/* Tabs */}
          <div className="px-6 border-t bg-gray-50">
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab("leads")}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "leads"
                    ? "border-blue-600 text-blue-600 bg-white"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Leads
                {pendingLeads.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full">
                    {pendingLeads.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab("introduction")}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "introduction"
                    ? "border-blue-600 text-blue-600 bg-white"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Introduction
              </button>
              <button
                onClick={() => setActiveTab("analysis")}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "analysis"
                    ? "border-blue-600 text-blue-600 bg-white"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Comprehensive Analysis
              </button>
              <button
                onClick={() => setActiveTab("accounts")}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "accounts"
                    ? "border-blue-600 text-blue-600 bg-white"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Accounts
              </button>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="px-6 py-4 bg-white border-b">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by name, location, or PAN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : activeTab === "leads" ? (
            <div className="bg-white rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Family Name</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Associate Name</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Location</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Date</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredLeads.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                          <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                          <p>No leads found</p>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="mt-3"
                            onClick={() => setShowNewLeadModal(true)}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add New Lead
                          </Button>
                        </td>
                      </tr>
                    ) : (
                      filteredLeads.map((lead) => (
                        <tr key={lead.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-800">{lead.family_name}</div>
                            <div className="text-xs text-gray-500">{lead.pan}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{lead.associate_name}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <MapPin className="h-3 w-3" />
                              {lead.location}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {lead.date ? format(new Date(lead.date), "dd MMM yyyy") : "-"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {getStatusBadge(lead.status)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <Edit2 className="h-4 w-4 mr-2" />
                                  Edit Lead
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === "introduction" ? (
            <div className="bg-white rounded-lg border p-8 text-center">
              <Briefcase className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-800 mb-2">Introduction</h3>
              <p className="text-gray-500">Track client introductions and initial meetings</p>
            </div>
          ) : activeTab === "analysis" ? (
            <div className="bg-white rounded-lg border p-8 text-center">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-800 mb-2">Comprehensive Analysis</h3>
              <p className="text-gray-500">View detailed analysis reports for leads</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border p-8 text-center">
              <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-800 mb-2">Accounts</h3>
              <p className="text-gray-500">Manage client accounts and banking details</p>
            </div>
          )}
        </div>
      </div>

      {/* New Lead Modal - Uses CreateClientModal */}
      {showNewLeadModal && (
        <CreateClientModal
          onClose={() => setShowNewLeadModal(false)}
          onSuccess={handleNewLeadSuccess}
          isSubBroker={user?.role === "sub_broker"}
        />
      )}
    </div>
  );
}
