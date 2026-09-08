import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  Search, Users, MapPin, MoreVertical, Plus, RefreshCw, 
  ChevronRight, Edit2, Trash2, Phone, Mail, Calendar,
  User, Filter, X, Building2
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STAGES = [
  { key: "leads", label: "Leads", nextLabel: "Introduction" },
  { key: "introduction", label: "Introduction", nextLabel: "Data Gathering" },
  { key: "data_gathering", label: "Data Gathering", nextLabel: "Account Opening" },
  { key: "account_opened", label: "Account Opened" },
];

const GENDER_OPTIONS = ["Male", "Female", "Other"];

const PASSPORT_TYPES = [
  { value: "indian", label: "Indian Passport Holder" },
  { value: "foreign", label: "Foreign Passport Holder" }
];

// Opportunities based on passport type
const OPPORTUNITIES_BY_PASSPORT = {
  indian: [
    { id: "ncd", label: "NCD Investments", description: "High-yield secured bonds" },
    { id: "real_estate", label: "Real Estate (Dubai)", description: "Fractional property ownership" },
    { id: "cas_analysis", label: "CAS Analysis", description: "Mutual fund portfolio analysis" },
    { id: "wealth_planning", label: "Wealth Planning", description: "Comprehensive financial planning" }
  ],
  foreign: [
    { id: "real_estate", label: "Real Estate (Dubai)", description: "Fractional property ownership" }
  ]
};

// Country data with states and cities
const COUNTRY_DATA = {
  "India": {
    states: {
      "Andhra Pradesh": ["Visakhapatnam", "Vijayawada", "Guntur", "Nellore", "Tirupati"],
      "Arunachal Pradesh": ["Itanagar", "Naharlagun", "Pasighat"],
      "Assam": ["Guwahati", "Silchar", "Dibrugarh", "Jorhat"],
      "Bihar": ["Patna", "Gaya", "Bhagalpur", "Muzaffarpur"],
      "Chhattisgarh": ["Raipur", "Bhilai", "Bilaspur", "Korba"],
      "Goa": ["Panaji", "Margao", "Vasco da Gama"],
      "Gujarat": ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Gandhinagar"],
      "Haryana": ["Gurugram", "Faridabad", "Panipat", "Ambala", "Karnal"],
      "Himachal Pradesh": ["Shimla", "Dharamshala", "Manali", "Kullu"],
      "Jharkhand": ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro"],
      "Karnataka": ["Bangalore", "Mysore", "Hubli", "Mangalore", "Belgaum"],
      "Kerala": ["Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur"],
      "Madhya Pradesh": ["Bhopal", "Indore", "Jabalpur", "Gwalior", "Ujjain"],
      "Maharashtra": ["Mumbai", "Pune", "Nagpur", "Thane", "Nashik", "Aurangabad"],
      "Manipur": ["Imphal", "Thoubal", "Bishnupur"],
      "Meghalaya": ["Shillong", "Tura", "Jowai"],
      "Mizoram": ["Aizawl", "Lunglei", "Champhai"],
      "Nagaland": ["Kohima", "Dimapur", "Mokokchung"],
      "Odisha": ["Bhubaneswar", "Cuttack", "Rourkela", "Puri"],
      "Punjab": ["Chandigarh", "Ludhiana", "Amritsar", "Jalandhar", "Patiala"],
      "Rajasthan": ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer"],
      "Sikkim": ["Gangtok", "Namchi", "Pelling"],
      "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem"],
      "Telangana": ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar"],
      "Tripura": ["Agartala", "Dharmanagar", "Udaipur"],
      "Uttar Pradesh": ["Lucknow", "Kanpur", "Agra", "Varanasi", "Noida", "Ghaziabad"],
      "Uttarakhand": ["Dehradun", "Haridwar", "Rishikesh", "Nainital"],
      "West Bengal": ["Kolkata", "Howrah", "Durgapur", "Siliguri", "Asansol"],
      "Delhi": ["New Delhi", "Delhi", "Noida", "Gurgaon"],
      "Jammu and Kashmir": ["Srinagar", "Jammu", "Anantnag"],
      "Ladakh": ["Leh", "Kargil"]
    }
  },
  "United Arab Emirates": {
    states: {
      "Abu Dhabi": ["Abu Dhabi City", "Al Ain", "Ruwais"],
      "Dubai": ["Dubai City", "Jebel Ali", "Dubai Marina"],
      "Sharjah": ["Sharjah City", "Khor Fakkan"],
      "Ajman": ["Ajman City"],
      "Umm Al Quwain": ["Umm Al Quwain City"],
      "Ras Al Khaimah": ["Ras Al Khaimah City"],
      "Fujairah": ["Fujairah City"]
    }
  },
  "United States": {
    states: {
      "California": ["Los Angeles", "San Francisco", "San Diego", "San Jose"],
      "New York": ["New York City", "Buffalo", "Albany"],
      "Texas": ["Houston", "Dallas", "Austin", "San Antonio"],
      "Florida": ["Miami", "Orlando", "Tampa", "Jacksonville"],
      "Illinois": ["Chicago", "Springfield", "Naperville"],
      "Pennsylvania": ["Philadelphia", "Pittsburgh", "Allentown"],
      "Ohio": ["Columbus", "Cleveland", "Cincinnati"],
      "Georgia": ["Atlanta", "Augusta", "Savannah"],
      "North Carolina": ["Charlotte", "Raleigh", "Durham"],
      "Michigan": ["Detroit", "Grand Rapids", "Ann Arbor"]
    }
  },
  "United Kingdom": {
    states: {
      "England": ["London", "Birmingham", "Manchester", "Liverpool", "Leeds"],
      "Scotland": ["Edinburgh", "Glasgow", "Aberdeen"],
      "Wales": ["Cardiff", "Swansea", "Newport"],
      "Northern Ireland": ["Belfast", "Derry", "Lisburn"]
    }
  },
  "Singapore": {
    states: {
      "Singapore": ["Singapore"]
    }
  },
  "Australia": {
    states: {
      "New South Wales": ["Sydney", "Newcastle", "Wollongong"],
      "Victoria": ["Melbourne", "Geelong", "Ballarat"],
      "Queensland": ["Brisbane", "Gold Coast", "Cairns"],
      "Western Australia": ["Perth", "Fremantle"],
      "South Australia": ["Adelaide"],
      "Tasmania": ["Hobart"]
    }
  },
  "Canada": {
    states: {
      "Ontario": ["Toronto", "Ottawa", "Mississauga"],
      "Quebec": ["Montreal", "Quebec City"],
      "British Columbia": ["Vancouver", "Victoria"],
      "Alberta": ["Calgary", "Edmonton"]
    }
  }
};

const DATE_FILTERS = [
  { value: "all", label: "All Time" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_year", label: "This Year" },
];

export default function CRMLeadManagement() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  
  // Tab state
  const [activeStage, setActiveStage] = useState("leads");
  const [highlightItems, setHighlightItems] = useState(false);
  
  // Data state
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState({ leads: 0, introduction: 0, account_opened: 0, total: 0 });
  const [advisors, setAdvisors] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [advisorFilter, setAdvisorFilter] = useState("all");
  
  // Modal state
  const [showNewLeadModal, setShowNewLeadModal] = useState(false);
  const [showEditLeadModal, setShowEditLeadModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    gender: "Male",
    mobile_number: "",
    email_id: "",
    passport_type: "",
    opportunities_interested: [],
    country: "",
    address_line_1: "",
    address_line_2: "",
    pincode: "",
    city: "",
    state: "",
    advisor_id: "",
    notes: ""
  });
  const [submitting, setSubmitting] = useState(false);
  
  // Delete reason
  const [deleteReason, setDeleteReason] = useState("");
  
  // Country/State/City dropdowns
  const [availableStates, setAvailableStates] = useState([]);
  const [availableCities, setAvailableCities] = useState([]);
  const [availableOpportunities, setAvailableOpportunities] = useState([]);

  useEffect(() => {
    document.title = "Kinntegraa | Lead Management";
  }, []);

  // Update opportunities when passport type changes
  useEffect(() => {
    if (formData.passport_type) {
      const opportunities = OPPORTUNITIES_BY_PASSPORT[formData.passport_type] || [];
      setAvailableOpportunities(opportunities);
      // Auto-select all opportunities for the passport type (only if not editing)
      if (!selectedLead) {
        setFormData(prev => ({ 
          ...prev, 
          opportunities_interested: opportunities.map(o => o.id) 
        }));
      }
    } else {
      setAvailableOpportunities([]);
    }
  }, [formData.passport_type, selectedLead]);

  // Update states when country changes
  useEffect(() => {
    if (formData.country && COUNTRY_DATA[formData.country]) {
      const states = Object.keys(COUNTRY_DATA[formData.country].states);
      setAvailableStates(states);
      setAvailableCities([]);
    } else {
      setAvailableStates([]);
      setAvailableCities([]);
    }
  }, [formData.country]);

  // Update cities when state changes
  useEffect(() => {
    if (formData.country && formData.state && COUNTRY_DATA[formData.country]?.states[formData.state]) {
      const cities = COUNTRY_DATA[formData.country].states[formData.state];
      setAvailableCities(cities);
    } else {
      setAvailableCities([]);
    }
  }, [formData.state, formData.country]);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);
    
    // Set default advisor to current user
    setFormData(prev => ({ ...prev, advisor_id: parsedUser.id }));
    
    // Handle stage from URL query params
    const stageParam = searchParams.get('stage');
    const highlightParam = searchParams.get('highlight');
    
    if (stageParam && ['leads', 'introduction', 'account_opened'].includes(stageParam)) {
      setActiveStage(stageParam);
    }
    
    if (highlightParam === 'true') {
      setHighlightItems(true);
      setTimeout(() => setHighlightItems(false), 5000);
    }
  }, [navigate, searchParams]);

  useEffect(() => {
    if (user) {
      fetchLeads();
      fetchStats();
      fetchAdvisors();
    }
  }, [user, activeStage, dateFilter, advisorFilter]);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const params = new URLSearchParams();
      params.append("stage", activeStage);
      if (dateFilter !== "all") params.append("date_filter", dateFilter);
      if (advisorFilter !== "all") params.append("advisor_id", advisorFilter);
      if (searchQuery) params.append("search", searchQuery);
      
      const response = await axios.get(`${API}/crm/leads?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLeads(response.data);
    } catch (error) {
      console.error("Error fetching leads:", error);
      toast.error("Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, [activeStage, dateFilter, advisorFilter, searchQuery]);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/crm/leads/stats/summary`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStats(response.data);
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const fetchAdvisors = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/crm/advisors`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAdvisors(response.data);
    } catch (error) {
      console.error("Error fetching advisors:", error);
    }
  };

  const handleSearch = () => {
    fetchLeads();
  };

  const resetForm = () => {
    setFormData({
      first_name: "",
      last_name: "",
      gender: "Male",
      mobile_number: "",
      email_id: "",
      passport_type: "",
      opportunities_interested: [],
      country: "",
      address_line_1: "",
      address_line_2: "",
      pincode: "",
      city: "",
      state: "",
      advisor_id: user?.id || "",
      notes: ""
    });
    setAvailableOpportunities([]);
  };

  const handleCreateLead = async () => {
    if (!formData.first_name || !formData.last_name || !formData.mobile_number || !formData.email_id) {
      toast.error("Please fill in all required fields");
      return;
    }
    
    setSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API}/crm/leads`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Lead created successfully");
      setShowNewLeadModal(false);
      resetForm();
      fetchLeads();
      fetchStats();
    } catch (error) {
      console.error("Error creating lead:", error);
      toast.error(error.response?.data?.detail || "Failed to create lead");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateLead = async () => {
    if (!selectedLead) return;
    
    setSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/crm/leads/${selectedLead.id}`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Lead updated successfully");
      setShowEditLeadModal(false);
      setSelectedLead(null);
      resetForm();
      fetchLeads();
    } catch (error) {
      console.error("Error updating lead:", error);
      toast.error(error.response?.data?.detail || "Failed to update lead");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteLead = async () => {
    if (!selectedLead) return;
    
    if (!deleteReason || deleteReason.trim().length < 3) {
      toast.error("Please provide a reason for deletion");
      return;
    }
    
    setSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/crm/leads/${selectedLead.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { reason: deleteReason.trim() }
      });
      toast.success("Lead deleted successfully");
      setShowDeleteConfirm(false);
      setSelectedLead(null);
      setDeleteReason("");
      fetchLeads();
      fetchStats();
    } catch (error) {
      console.error("Error deleting lead:", error);
      toast.error(error.response?.data?.detail || "Failed to delete lead");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStageChange = async (lead, newStage) => {
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/crm/leads/${lead.id}/stage`, { stage: newStage }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(`Lead moved to ${newStage.replace('_', ' ')}`);
      fetchLeads();
      fetchStats();
    } catch (error) {
      console.error("Error updating stage:", error);
      toast.error(error.response?.data?.detail || "Failed to update stage");
    }
  };

  const handleProceedToIntroduction = async (lead) => {
    // Simply move lead to introduction stage
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `${API}/crm/leads/${lead.id}/stage`,
        { stage: "introduction" },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success("Lead moved to Introduction stage");
      fetchLeads(); // Refresh data
    } catch (error) {
      console.error("Error updating lead stage:", error);
      toast.error("Failed to update lead stage");
    }
  };

  const handleProceedToDataGathering = async (lead) => {
    // Update lead stage to data_gathering and navigate to Data Gathering page
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `${API}/crm/leads/${lead.id}/stage`,
        { stage: "data_gathering" },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Navigate to Data Gathering page to fill data
      const leadDataForFamily = {
        crm_lead_id: lead.id,
        name: lead.full_name,
        email: lead.email_id,
        phone: lead.mobile_number,
        dob: lead.dob || "",
        address: [lead.address_line_1, lead.address_line_2, lead.city, lead.state, lead.pincode].filter(Boolean).join(", "),
        country: lead.country,
        advisor_id: lead.advisor_id,
        current_stage: 'data_gathering'
      };
      sessionStorage.setItem('pendingLeadForFamily', JSON.stringify(leadDataForFamily));
      
      const basePath = user?.role === 'broker' ? '/broker' : '/sub-broker';
      navigate(`${basePath}/data-gathering?fromLead=${lead.id}`);
      
      toast.success("Lead moved to Data Gathering stage");
      fetchLeads(); // Refresh data
    } catch (error) {
      console.error("Error updating lead stage:", error);
      toast.error("Failed to update lead stage");
    }
  };

  const handleProceedToAccountOpening = (lead) => {
    // Store lead data for client creation
    const leadDataForClient = {
      crm_lead_id: lead.id,
      lead_code: lead.lead_code,
      name: lead.full_name,
      first_name: lead.first_name,
      last_name: lead.last_name,
      email: lead.email_id,
      phone: lead.mobile_number,
      gender: lead.gender,
      address: [lead.address_line_1, lead.address_line_2].filter(Boolean).join(", "),
      city: lead.city,
      state: lead.state,
      country: lead.country,
      pincode: lead.pincode,
      passport_type: lead.passport_type,
      opportunities_interested: lead.opportunities_interested
    };
    sessionStorage.setItem('pendingLeadForClient', JSON.stringify(leadDataForClient));
    
    // Navigate to Clients page for account creation
    const basePath = user?.role === 'broker' ? '/broker' : '/sub-broker';
    navigate(`${basePath}/admin/clients?createFromLead=${lead.id}`);
    
    toast.info("Create client account to complete the process");
  };

  const openEditModal = (lead) => {
    setSelectedLead(lead);
    // Set available opportunities based on passport type
    if (lead.passport_type && OPPORTUNITIES_BY_PASSPORT[lead.passport_type]) {
      setAvailableOpportunities(OPPORTUNITIES_BY_PASSPORT[lead.passport_type]);
    }
    setFormData({
      first_name: lead.first_name || "",
      last_name: lead.last_name || "",
      gender: lead.gender || "Male",
      mobile_number: lead.mobile_number || "",
      email_id: lead.email_id || "",
      passport_type: lead.passport_type || "",
      opportunities_interested: lead.opportunities_interested || [],
      country: lead.country || "",
      address_line_1: lead.address_line_1 || "",
      address_line_2: lead.address_line_2 || "",
      pincode: lead.pincode || "",
      city: lead.city || "",
      state: lead.state || "",
      advisor_id: lead.advisor_id || "",
      notes: lead.notes || ""
    });
    setShowEditLeadModal(true);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    try {
      return format(new Date(dateStr), "dd MMM yyyy, hh:mm a");
    } catch {
      return dateStr;
    }
  };

  const getNextStage = (currentStage) => {
    const stageIndex = STAGES.findIndex(s => s.key === currentStage);
    return stageIndex < STAGES.length - 1 ? STAGES[stageIndex + 1] : null;
  };

  const getCurrentStageConfig = () => {
    return STAGES.find(s => s.key === activeStage);
  };

  if (!user) return null;

  const SidebarComponent = user.role === "broker" ? Sidebar : SubBrokerSidebar;
  const currentStageConfig = getCurrentStageConfig();

  return (
    <div className="min-h-screen bg-gray-50 flex" data-testid="crm-lead-management-page">
      <SidebarComponent user={user} />

      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b sticky top-0 z-20">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center">
                  <Users className="h-5 w-5 text-teal-600" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-800" data-testid="page-title">Lead Management</h1>
                  <p className="text-sm text-gray-500">Track and manage your sales pipeline</p>
                </div>
              </div>
              <Button 
                onClick={() => { resetForm(); setShowNewLeadModal(true); }}
                className="bg-teal-600 hover:bg-teal-700"
                data-testid="new-lead-btn"
              >
                <Plus className="h-4 w-4 mr-2" />
                NEW LEAD
              </Button>
            </div>
          </div>

          {/* Stage Tabs */}
          <div className="px-6 border-t bg-gray-50">
            <div className="flex items-center gap-1 overflow-x-auto">
              {STAGES.map((stage) => (
                <button
                  key={stage.key}
                  onClick={() => setActiveStage(stage.key)}
                  className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeStage === stage.key
                      ? "border-teal-600 text-teal-700 bg-white"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                  data-testid={`tab-${stage.key}`}
                >
                  {stage.label}
                  {stats[stage.key] > 0 && (
                    <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                      activeStage === stage.key ? "bg-teal-100 text-teal-700" : "bg-gray-200 text-gray-600"
                    }`}>
                      {stats[stage.key]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="px-6 py-3 bg-white border-b">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by name, email, phone, or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-9 h-9"
                data-testid="search-input"
              />
            </div>
            
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-36 h-9" data-testid="date-filter">
                <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                <SelectValue placeholder="Date Filter" />
              </SelectTrigger>
              <SelectContent>
                {DATE_FILTERS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {user?.role === 'broker' && (
              <Select value={advisorFilter} onValueChange={setAdvisorFilter}>
                <SelectTrigger className="w-40 h-9" data-testid="advisor-filter">
                  <User className="h-4 w-4 mr-2 text-gray-400" />
                  <SelectValue placeholder="All Advisors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Advisors</SelectItem>
                  {advisors.map((adv) => (
                    <SelectItem key={adv.id} value={adv.id}>{adv.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            <Button variant="ghost" size="sm" onClick={fetchLeads}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Leads Table */}
        <div className="p-6">
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-teal-600 mx-auto mb-3" />
                <p className="text-gray-500">Loading leads...</p>
              </div>
            ) : leads.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-gray-600 mb-1">No Leads Found</h3>
                <p className="text-gray-400 text-sm">
                  {activeStage === 'leads' 
                    ? 'Click "NEW LEAD" to add your first lead'
                    : `No leads in the ${currentStageConfig?.label} stage`}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Client Name</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Advisor Name</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Location</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {leads.map((lead) => {
                      const nextStage = getNextStage(lead.stage);
                      const isNewFromSignup = lead.source === 'public_signup' && !lead.advisor_id;
                      return (
                        <tr key={lead.id} className={`hover:bg-gray-50 ${highlightItems && isNewFromSignup ? 'bg-amber-50 ring-2 ring-amber-200' : ''}`} data-testid={`lead-row-${lead.id}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center font-medium text-sm ${highlightItems && isNewFromSignup ? 'bg-amber-200 text-amber-800' : 'bg-teal-100 text-teal-700'}`}>
                                {lead.first_name?.[0]}{lead.last_name?.[0]}
                              </div>
                              <div>
                                <div className="font-medium text-gray-800">
                                  {lead.full_name}
                                  {isNewFromSignup && (
                                    <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">NEW</span>
                                  )}
                                  {/* Only show UCC/lead_code for Account Opened stage */}
                                  {lead.stage === 'account_opened' && lead.ucc && (
                                    <span className="ml-2 text-xs text-green-600 font-semibold">({lead.ucc})</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-gray-500">
                                  <span className="flex items-center gap-1">
                                    <Mail className="h-3 w-3" />
                                    {lead.email_id}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Phone className="h-3 w-3" />
                                    {lead.mobile_number}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {lead.advisor_name || '-'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <MapPin className="h-3.5 w-3.5 text-gray-400" />
                              {lead.city || lead.state || 'Not specified'}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {formatDate(lead.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {/* Leads stage: "Proceed to Introduction" navigates to Data Gathering */}
                              {activeStage === 'leads' && (
                                <button
                                  onClick={() => handleProceedToIntroduction(lead)}
                                  className="text-xs text-teal-600 hover:text-teal-800 font-medium flex items-center gap-1"
                                  data-testid={`proceed-btn-${lead.id}`}
                                >
                                  Proceed to: INTRODUCTION
                                  <ChevronRight className="h-3 w-3" />
                                </button>
                              )}
                              {/* Other stages: normal stage progression */}
                              {activeStage === 'introduction' && (
                                <button
                                  onClick={() => handleProceedToDataGathering(lead)}
                                  className="text-xs text-teal-600 hover:text-teal-800 font-medium flex items-center gap-1"
                                  data-testid={`proceed-btn-${lead.id}`}
                                >
                                  Proceed to: DATA GATHERING
                                  <ChevronRight className="h-3 w-3" />
                                </button>
                              )}
                              {/* Data Gathering stage: Proceed to Account Opening */}
                              {activeStage === 'data_gathering' && (
                                <button
                                  onClick={() => handleProceedToAccountOpening(lead)}
                                  className="text-xs text-teal-600 hover:text-teal-800 font-medium flex items-center gap-1"
                                  data-testid={`proceed-btn-${lead.id}`}
                                >
                                  Proceed to: ACCOUNT OPENING
                                  <ChevronRight className="h-3 w-3" />
                                </button>
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openEditModal(lead)}>
                                    <Edit2 className="h-4 w-4 mr-2" />
                                    Edit Lead
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    onClick={() => { setSelectedLead(lead); setShowDeleteConfirm(true); }}
                                    className="text-red-600"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Lead
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
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
      </div>

      {/* New Lead Modal */}
      <Dialog open={showNewLeadModal} onOpenChange={setShowNewLeadModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Lead</DialogTitle>
            <DialogDescription>Add a new prospect to your sales pipeline</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Personal Information */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Personal Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="first_name">First Name *</Label>
                  <Input
                    id="first_name"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    placeholder="Jon"
                    className="mt-1"
                    data-testid="input-first-name"
                  />
                </div>
                <div>
                  <Label htmlFor="last_name">Last Name *</Label>
                  <Input
                    id="last_name"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    placeholder="Adler"
                    className="mt-1"
                    data-testid="input-last-name"
                  />
                </div>
                <div>
                  <Label htmlFor="gender">Gender</Label>
                  <Select value={formData.gender} onValueChange={(v) => setFormData({ ...formData, gender: v })}>
                    <SelectTrigger className="mt-1" data-testid="select-gender">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDER_OPTIONS.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="mobile_number">Mobile Number *</Label>
                  <Input
                    id="mobile_number"
                    value={formData.mobile_number}
                    onChange={(e) => setFormData({ ...formData, mobile_number: e.target.value })}
                    placeholder="8870121212"
                    className="mt-1"
                    data-testid="input-mobile"
                  />
                </div>
                <div>
                  <Label htmlFor="email_id">Email ID *</Label>
                  <Input
                    id="email_id"
                    type="email"
                    value={formData.email_id}
                    onChange={(e) => setFormData({ ...formData, email_id: e.target.value })}
                    placeholder="email@example.com"
                    className="mt-1"
                    data-testid="input-email"
                  />
                </div>
              </div>
            </div>

            {/* Investment Preferences */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Investment Preferences</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="passport_type">Passport Type *</Label>
                  <Select 
                    value={formData.passport_type} 
                    onValueChange={(v) => setFormData({ ...formData, passport_type: v })}
                  >
                    <SelectTrigger className="mt-1" data-testid="select-passport-type">
                      <SelectValue placeholder="Select passport type" />
                    </SelectTrigger>
                    <SelectContent>
                      {PASSPORT_TYPES.map((pt) => (
                        <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {formData.passport_type && (
                  <div className="col-span-2">
                    <Label className="mb-2 block">Opportunities Interested In</Label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      {availableOpportunities.map((opp) => {
                        const isSelected = formData.opportunities_interested.includes(opp.id);
                        return (
                          <label 
                            key={opp.id}
                            className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-all text-sm ${
                              isSelected 
                                ? 'border-teal-500 bg-teal-50' 
                                : 'border-gray-200 hover:border-gray-300 bg-white'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                const newOpps = e.target.checked
                                  ? [...formData.opportunities_interested, opp.id]
                                  : formData.opportunities_interested.filter(id => id !== opp.id);
                                setFormData({ ...formData, opportunities_interested: newOpps });
                              }}
                              className="mt-0.5 h-4 w-4 text-teal-600 rounded border-gray-300"
                            />
                            <div>
                              <p className={`font-medium ${isSelected ? 'text-teal-700' : 'text-gray-700'}`}>
                                {opp.label}
                              </p>
                              <p className="text-xs text-gray-500">{opp.description}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                    {formData.passport_type === 'foreign' && (
                      <p className="text-xs text-amber-600 mt-2">
                        Note: NCD investments and CAS analysis are available only for Indian passport holders
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Address Details */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Address Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="country">Country *</Label>
                  <Select 
                    value={formData.country} 
                    onValueChange={(v) => setFormData({ ...formData, country: v, state: "", city: "" })}
                  >
                    <SelectTrigger className="mt-1" data-testid="select-country">
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(COUNTRY_DATA).map((country) => (
                        <SelectItem key={country} value={country}>{country}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="state">State / Province</Label>
                  <Select 
                    value={formData.state} 
                    onValueChange={(v) => setFormData({ ...formData, state: v, city: "" })}
                    disabled={!formData.country}
                  >
                    <SelectTrigger className="mt-1" data-testid="select-state">
                      <SelectValue placeholder={formData.country ? "Select state" : "Select country first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableStates.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="city">City</Label>
                  <Select 
                    value={formData.city} 
                    onValueChange={(v) => setFormData({ ...formData, city: v })}
                    disabled={!formData.state}
                  >
                    <SelectTrigger className="mt-1" data-testid="select-city">
                      <SelectValue placeholder={formData.state ? "Select city" : "Select state first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCities.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label htmlFor="address_line_1">Address Line 1</Label>
                  <Input
                    id="address_line_1"
                    value={formData.address_line_1}
                    onChange={(e) => setFormData({ ...formData, address_line_1: e.target.value })}
                    placeholder="Street address"
                    className="mt-1"
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="address_line_2">Address Line 2</Label>
                  <Input
                    id="address_line_2"
                    value={formData.address_line_2}
                    onChange={(e) => setFormData({ ...formData, address_line_2: e.target.value })}
                    placeholder="Apartment, suite, etc."
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="pincode">Pincode / Zip Code</Label>
                  <Input
                    id="pincode"
                    value={formData.pincode}
                    onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                    placeholder="400703"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="advisor_id">Assign to Advisor</Label>
                  <Select value={formData.advisor_id} onValueChange={(v) => setFormData({ ...formData, advisor_id: v })}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select advisor" />
                    </SelectTrigger>
                    <SelectContent>
                      {advisors.map((adv) => (
                        <SelectItem key={adv.id} value={adv.id}>{adv.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes about this lead..."
                className="mt-1"
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewLeadModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateLead} 
              disabled={submitting}
              className="bg-teal-600 hover:bg-teal-700"
              data-testid="save-lead-btn"
            >
              {submitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Lead Modal */}
      <Dialog open={showEditLeadModal} onOpenChange={setShowEditLeadModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Lead</DialogTitle>
            <DialogDescription>Update lead information</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Personal Information */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Personal Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit_first_name">First Name *</Label>
                  <Input
                    id="edit_first_name"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit_last_name">Last Name *</Label>
                  <Input
                    id="edit_last_name"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit_gender">Gender</Label>
                  <Select value={formData.gender} onValueChange={(v) => setFormData({ ...formData, gender: v })}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDER_OPTIONS.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit_mobile">Mobile Number *</Label>
                  <Input
                    id="edit_mobile"
                    value={formData.mobile_number}
                    onChange={(e) => setFormData({ ...formData, mobile_number: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit_email">Email ID *</Label>
                  <Input
                    id="edit_email"
                    type="email"
                    value={formData.email_id}
                    onChange={(e) => setFormData({ ...formData, email_id: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Investment Preferences */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Investment Preferences</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="edit_passport_type">Passport Type</Label>
                  <Select 
                    value={formData.passport_type} 
                    onValueChange={(v) => setFormData({ ...formData, passport_type: v })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select passport type" />
                    </SelectTrigger>
                    <SelectContent>
                      {PASSPORT_TYPES.map((pt) => (
                        <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {formData.passport_type && (
                  <div className="col-span-2">
                    <Label className="mb-2 block">Opportunities Interested In</Label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      {availableOpportunities.map((opp) => {
                        const isSelected = formData.opportunities_interested.includes(opp.id);
                        return (
                          <label 
                            key={opp.id}
                            className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-all text-sm ${
                              isSelected 
                                ? 'border-teal-500 bg-teal-50' 
                                : 'border-gray-200 hover:border-gray-300 bg-white'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                const newOpps = e.target.checked
                                  ? [...formData.opportunities_interested, opp.id]
                                  : formData.opportunities_interested.filter(id => id !== opp.id);
                                setFormData({ ...formData, opportunities_interested: newOpps });
                              }}
                              className="mt-0.5 h-4 w-4 text-teal-600 rounded border-gray-300"
                            />
                            <div>
                              <p className={`font-medium ${isSelected ? 'text-teal-700' : 'text-gray-700'}`}>
                                {opp.label}
                              </p>
                              <p className="text-xs text-gray-500">{opp.description}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                    {formData.passport_type === 'foreign' && (
                      <p className="text-xs text-amber-600 mt-2">
                        Note: NCD investments and CAS analysis are available only for Indian passport holders
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Address Details */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Address Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="edit_country">Country</Label>
                  <Select 
                    value={formData.country} 
                    onValueChange={(v) => setFormData({ ...formData, country: v, state: "", city: "" })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(COUNTRY_DATA).map((country) => (
                        <SelectItem key={country} value={country}>{country}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit_state">State / Province</Label>
                  <Select 
                    value={formData.state} 
                    onValueChange={(v) => setFormData({ ...formData, state: v, city: "" })}
                    disabled={!formData.country}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={formData.country ? "Select state" : "Select country first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableStates.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit_city">City</Label>
                  <Select 
                    value={formData.city} 
                    onValueChange={(v) => setFormData({ ...formData, city: v })}
                    disabled={!formData.state}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={formData.state ? "Select city" : "Select state first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCities.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label htmlFor="edit_address_1">Address Line 1</Label>
                  <Input
                    id="edit_address_1"
                    value={formData.address_line_1}
                    onChange={(e) => setFormData({ ...formData, address_line_1: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="edit_address_2">Address Line 2</Label>
                  <Input
                    id="edit_address_2"
                    value={formData.address_line_2}
                    onChange={(e) => setFormData({ ...formData, address_line_2: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit_pincode">Pincode / Zip Code</Label>
                  <Input
                    id="edit_pincode"
                    value={formData.pincode}
                    onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit_advisor">Assign to Advisor</Label>
                  <Select value={formData.advisor_id} onValueChange={(v) => setFormData({ ...formData, advisor_id: v })}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select advisor" />
                    </SelectTrigger>
                    <SelectContent>
                      {advisors.map((adv) => (
                        <SelectItem key={adv.id} value={adv.id}>{adv.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label htmlFor="edit_notes">Notes</Label>
              <Textarea
                id="edit_notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="mt-1"
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditLeadModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateLead} 
              disabled={submitting}
              className="bg-teal-600 hover:bg-teal-700"
            >
              {submitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={showDeleteConfirm} onOpenChange={(open) => { setShowDeleteConfirm(open); if (!open) setDeleteReason(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete Lead</DialogTitle>
            <DialogDescription>
              You are about to delete <span className="font-semibold">{selectedLead?.full_name}</span>. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Label htmlFor="delete_reason" className="text-sm font-medium">
              Reason for deletion <span className="text-red-500">*</span>
            </Label>
            <Select value={deleteReason} onValueChange={setDeleteReason}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Duplicate entry">Duplicate entry</SelectItem>
                <SelectItem value="Invalid contact information">Invalid contact information</SelectItem>
                <SelectItem value="Not interested">Not interested / Declined</SelectItem>
                <SelectItem value="Already a client">Already a client</SelectItem>
                <SelectItem value="Competitor lead">Competitor lead</SelectItem>
                <SelectItem value="Test entry">Test entry</SelectItem>
                <SelectItem value="Request by lead">Request by lead (GDPR/Data removal)</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
            
            {deleteReason === "Other" && (
              <Textarea
                className="mt-2"
                placeholder="Please specify the reason..."
                value={deleteReason === "Other" ? "" : deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                rows={2}
              />
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDeleteConfirm(false); setDeleteReason(""); }}>
              Cancel
            </Button>
            <Button 
              onClick={handleDeleteLead} 
              disabled={submitting || !deleteReason || deleteReason.length < 3}
              className="bg-red-600 hover:bg-red-700"
            >
              {submitting ? "Deleting..." : "Delete Lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
