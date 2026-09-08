import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { 
  CheckSquare, RefreshCw, Eye, Phone, CheckCircle, XCircle,
  Mail, User, Calendar, Building, MessageSquare, Heart
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import Sidebar from "@/components/Sidebar";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function SubBrokerApprovals() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("interests");
  const [interests, setInterests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInterest, setSelectedInterest] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showNotInterestedModal, setShowNotInterestedModal] = useState(false);
  const [notInterestedReason, setNotInterestedReason] = useState("");
  const [processingId, setProcessingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    document.title = "Kinntegraa | Approve";
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
    
    // Check URL for tab
    const tab = searchParams.get('tab');
    if (tab === 'interests') {
      setActiveTab('interests');
    }
  }, [navigate, searchParams]);

  const fetchInterests = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/sub-broker/interests`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setInterests(response.data || []);
    } catch (error) {
      console.error("Error fetching interests:", error);
      toast.error("Failed to load interests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchInterests();
    }
  }, [user, fetchInterests]);

  const handleUpdateStatus = async (interestId, status) => {
    setProcessingId(interestId);
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/leads/${interestId}/status`, 
        { status },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`Interest marked as ${status}`);
      fetchInterests();
      setShowDetailsModal(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update status");
    } finally {
      setProcessingId(null);
    }
  };

  const handleNotInterested = async () => {
    if (!notInterestedReason.trim()) {
      toast.error("Please provide a reason");
      return;
    }
    setProcessingId(selectedInterest?.id);
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/leads/${selectedInterest.id}/status`, 
        { status: "not_interested", reason: notInterestedReason },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Marked as not interested");
      setShowNotInterestedModal(false);
      setShowDetailsModal(false);
      setNotInterestedReason("");
      fetchInterests();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update");
    } finally {
      setProcessingId(null);
    }
  };

  const filteredInterests = interests.filter(interest => {
    const query = searchQuery.toLowerCase();
    return (
      interest.client_name?.toLowerCase().includes(query) ||
      interest.client_email?.toLowerCase().includes(query) ||
      interest.opportunity_name?.toLowerCase().includes(query)
    );
  });

  const getStatusBadge = (status) => {
    const styles = {
      open: "bg-blue-100 text-blue-700",
      contacted: "bg-yellow-100 text-yellow-700",
      converted: "bg-green-100 text-green-700",
      not_interested: "bg-red-100 text-red-700",
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-700'}`}>
        {status?.replace('_', ' ').charAt(0).toUpperCase() + status?.slice(1).replace('_', ' ')}
      </span>
    );
  };

  const tabs = [
    { id: "interests", label: "Interests", icon: Heart, count: interests.length }
  ];

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar user={user} />
      
      <div className="flex-1 md:ml-0">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-800 flex items-center gap-2">
                <CheckSquare className="h-6 w-6 text-etihad-gold-600" />
                Approve
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Manage interests from your private investors
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-[200px]"
              />
              <Button variant="outline" onClick={fetchInterests}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white border-b px-4 md:px-8">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-etihad-gold-600 text-etihad-gold-700 bg-etihad-gold-50/50'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="font-medium">{tab.label}</span>
                  {tab.count > 0 && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      activeTab === tab.id 
                        ? 'bg-etihad-gold-100 text-etihad-gold-700' 
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="p-4 md:p-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-etihad-gold-600" />
            </div>
          ) : filteredInterests.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border">
              <MessageSquare className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">No interests yet</p>
              <p className="text-sm text-gray-400">
                When your private investors show interest in opportunities, they will appear here
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Client</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">MFD/RIA</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Opportunity</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredInterests.map((interest) => (
                      <tr key={interest.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-gray-800">{interest.client_name}</p>
                            <p className="text-xs text-gray-500">{interest.client_email}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-gray-600">{user?.name || 'You'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-gray-700">{interest.opportunity_name || 'N/A'}</p>
                          <p className="text-xs text-gray-500">{interest.opportunity_type}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {interest.created_at ? new Date(interest.created_at).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="px-4 py-3">
                          {getStatusBadge(interest.status)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              setSelectedInterest(interest);
                              setShowDetailsModal(true);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
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

      {/* Interest Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Interest Details</DialogTitle>
          </DialogHeader>
          
          {selectedInterest && (
            <div className="space-y-4">
              {/* Client Info */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Client Information
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Name:</span>
                    <p className="font-medium">{selectedInterest.client_name}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Email:</span>
                    <p className="font-medium">{selectedInterest.client_email}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Phone:</span>
                    <p className="font-medium">{selectedInterest.client_phone || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">PAN:</span>
                    <p className="font-medium font-mono">{selectedInterest.client_pan || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Opportunity Info */}
              <div className="bg-blue-50 rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                  <Building className="h-4 w-4" />
                  Opportunity
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Name:</span>
                    <p className="font-medium">{selectedInterest.opportunity_name}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Type:</span>
                    <p className="font-medium">{selectedInterest.opportunity_type}</p>
                  </div>
                </div>
              </div>

              {/* Message */}
              {selectedInterest.message && (
                <div className="bg-yellow-50 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-800 flex items-center gap-2 mb-2">
                    <MessageSquare className="h-4 w-4" />
                    Message
                  </h4>
                  <p className="text-sm text-gray-700">{selectedInterest.message}</p>
                </div>
              )}

              {/* Status & Date */}
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-500">
                    {selectedInterest.created_at ? new Date(selectedInterest.created_at).toLocaleString() : 'N/A'}
                  </span>
                </div>
                {getStatusBadge(selectedInterest.status)}
              </div>
            </div>
          )}

          <DialogFooter className="flex-col gap-3 sm:gap-2">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full">
              <Button 
                variant="outline" 
                onClick={() => setShowNotInterestedModal(true)}
                disabled={processingId === selectedInterest?.id || selectedInterest?.status === 'not_interested'}
                className="text-red-600 border-red-200 hover:bg-red-50 w-full sm:w-auto"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Not Interested
              </Button>
              <div className="flex flex-col sm:flex-row gap-2 sm:ml-auto">
                <Button variant="outline" onClick={() => setShowDetailsModal(false)} className="w-full sm:w-auto">
                  Close
                </Button>
                <Button
                  onClick={() => handleUpdateStatus(selectedInterest?.id, 'contacted')}
                  disabled={processingId === selectedInterest?.id || selectedInterest?.status === 'contacted'}
                  className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
                >
                  <Phone className="h-4 w-4 mr-2" />
                  Mark as Contacted
                </Button>
                <Button
                  onClick={() => handleUpdateStatus(selectedInterest?.id, 'converted')}
                  disabled={processingId === selectedInterest?.id || selectedInterest?.status === 'converted'}
                  className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Mark as Converted
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Not Interested Modal */}
      <Dialog open={showNotInterestedModal} onOpenChange={setShowNotInterestedModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Not Interested</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Please provide a reason for marking this interest as not interested:
            </p>
            <Textarea
              placeholder="Enter reason..."
              value={notInterestedReason}
              onChange={(e) => setNotInterestedReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNotInterestedModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleNotInterested}
              disabled={processingId}
              className="bg-red-600 hover:bg-red-700"
            >
              {processingId ? "Processing..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
