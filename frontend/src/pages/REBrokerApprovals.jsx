import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CheckSquare, RefreshCw, Search, UserCheck, Check, X, Eye, Tag, DollarSign, TrendingUp, Link2 } from "lucide-react";
import REBrokerSidebar from "@/components/REBrokerSidebar";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function REBrokerApprovals() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [brokerProfile, setBrokerProfile] = useState(null);
  const [pendingInvestors, setPendingInvestors] = useState([]);
  const [untaggedPayments, setUntaggedPayments] = useState([]);
  const [interestRequests, setInterestRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Get active tab from URL or default to "private-investors"
  const activeTab = searchParams.get("tab") || "private-investors";

  useEffect(() => {
    document.title = "Kinntegraa | RE Broker - Approvals";
    
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
    fetchPendingInvestors(token);
    fetchUntaggedPayments(token);
    fetchInterestRequests(token);
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

  const fetchPendingInvestors = useCallback(async (token) => {
    setLoading(true);
    try {
      const tkn = token || localStorage.getItem("token");
      const response = await axios.get(`${API}/re-broker/pending-investors`, {
        headers: { Authorization: `Bearer ${tkn}` }
      });
      const data = response.data;
      setPendingInvestors(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching pending investors:", error);
      setPendingInvestors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUntaggedPayments = useCallback(async (token) => {
    try {
      const tkn = token || localStorage.getItem("token");
      const response = await axios.get(`${API}/re-broker/untagged-payments`, {
        headers: { Authorization: `Bearer ${tkn}` }
      });
      const data = response.data;
      setUntaggedPayments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching untagged payments:", error);
      setUntaggedPayments([]);
    }
  }, []);

  const fetchInterestRequests = useCallback(async (token) => {
    try {
      const tkn = token || localStorage.getItem("token");
      const response = await axios.get(`${API}/re-broker/interest-requests`, {
        headers: { Authorization: `Bearer ${tkn}` }
      });
      const data = response.data;
      setInterestRequests(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching interest requests:", error);
      setInterestRequests([]);
    }
  }, []);

  const handleApprove = async (investorId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/re-broker/approve-investor/${investorId}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Investor approved successfully");
      fetchPendingInvestors(token);
    } catch (error) {
      console.error("Error approving investor:", error);
      toast.error("Failed to approve investor");
    }
  };

  const handleReject = async (investorId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/re-broker/reject-investor/${investorId}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Investor rejected");
      fetchPendingInvestors(token);
    } catch (error) {
      console.error("Error rejecting investor:", error);
      toast.error("Failed to reject investor");
    }
  };

  const handleTagPayment = async (paymentId, propertyId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/re-broker/tag-payment/${paymentId}`, {
        property_id: propertyId
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Payment tagged successfully");
      fetchUntaggedPayments(token);
    } catch (error) {
      console.error("Error tagging payment:", error);
      toast.error("Failed to tag payment");
    }
  };

  const handleMarkContacted = async (interestId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/re-broker/interest/${interestId}/contacted`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Marked as contacted");
      fetchInterestRequests(token);
    } catch (error) {
      console.error("Error updating interest:", error);
      toast.error("Failed to update status");
    }
  };

  const handleMarkConverted = async (interestId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/re-broker/interest/${interestId}/converted`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Marked as converted");
      fetchInterestRequests(token);
    } catch (error) {
      console.error("Error updating interest:", error);
      toast.error("Failed to update status");
    }
  };

  const formatCurrency = (amount, currency = 'AED') => {
    if (!amount) return '-';
    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const filteredInvestors = pendingInvestors.filter(inv => {
    const query = searchQuery.toLowerCase();
    return (
      inv.name?.toLowerCase().includes(query) ||
      inv.email?.toLowerCase().includes(query) ||
      inv.phone?.toLowerCase().includes(query)
    );
  });

  const filteredPayments = untaggedPayments.filter(payment => {
    const query = searchQuery.toLowerCase();
    return (
      payment.client_name?.toLowerCase().includes(query) ||
      payment.reference?.toLowerCase().includes(query) ||
      payment.amount?.toString().includes(query)
    );
  });

  const filteredInterests = interestRequests.filter(interest => {
    const query = searchQuery.toLowerCase();
    return (
      interest.client_name?.toLowerCase().includes(query) ||
      interest.property_name?.toLowerCase().includes(query) ||
      interest.email?.toLowerCase().includes(query)
    );
  });

  const setActiveTab = (tab) => {
    setSearchParams({ tab });
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <REBrokerSidebar user={user} brokerProfile={brokerProfile} />
      
      <div className="flex-1 md:ml-0">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="ml-12 md:ml-0">
              <h1 className="text-xl md:text-2xl font-bold text-gray-800 flex items-center gap-2">
                <CheckSquare className="h-6 w-6 text-amber-600" />
                Approvals
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Review and approve pending requests
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-[250px]"
                  data-testid="search-input"
                />
              </div>
              <Button variant="outline" onClick={() => fetchPendingInvestors()} data-testid="refresh-btn">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white border-b px-4 md:px-8">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab("private-investors")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "private-investors"
                  ? "border-amber-500 text-amber-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              data-testid="tab-private-investors"
            >
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4" />
                Private Investors
                {filteredInvestors.length > 0 && (
                  <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">
                    {filteredInvestors.length}
                  </span>
                )}
              </div>
            </button>
            <button
              onClick={() => setActiveTab("payment")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "payment"
                  ? "border-amber-500 text-amber-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              data-testid="tab-payment"
            >
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Payment
                {filteredPayments.length > 0 && (
                  <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full">
                    {filteredPayments.length}
                  </span>
                )}
              </div>
            </button>
            <button
              onClick={() => setActiveTab("interest")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "interest"
                  ? "border-amber-500 text-amber-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              data-testid="tab-interest"
            >
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Interest
                {filteredInterests.length > 0 && (
                  <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">
                    {filteredInterests.length}
                  </span>
                )}
              </div>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 md:p-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-amber-600" />
            </div>
          ) : activeTab === "private-investors" ? (
            /* Private Investors Tab */
            filteredInvestors.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg border">
                <CheckSquare className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 mb-2">No pending approvals</p>
                <p className="text-sm text-gray-400">
                  New investor registrations will appear here for your review
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-lg border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Name</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Contact</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Submitted</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredInvestors.map((investor) => (
                        <tr key={investor.id || investor._id} className="hover:bg-gray-50" data-testid={`investor-row-${investor.id || investor._id}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                                <span className="text-amber-600 font-bold">
                                  {investor.name?.charAt(0) || 'I'}
                                </span>
                              </div>
                              <div>
                                <p className="font-medium text-gray-800">{investor.name}</p>
                                <p className="text-xs text-gray-500">{investor.pan || investor.id_number || '-'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-gray-700">{investor.email}</p>
                            <p className="text-xs text-gray-500">{investor.phone || '-'}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {investor.created_at 
                              ? new Date(investor.created_at).toLocaleDateString() 
                              : '-'}
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                              Pending
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toast.info("View details coming soon")}
                                data-testid={`view-btn-${investor.id || investor._id}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleReject(investor.id || investor._id)}
                                data-testid={`reject-btn-${investor.id || investor._id}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700"
                                onClick={() => handleApprove(investor.id || investor._id)}
                                data-testid={`approve-btn-${investor.id || investor._id}`}
                              >
                                <Check className="h-4 w-4 mr-1" />
                                Approve
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          ) : activeTab === "payment" ? (
            /* Payment Tab */
            filteredPayments.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg border">
                <Tag className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 mb-2">No untagged payments</p>
                <p className="text-sm text-gray-400">
                  All real estate payments have been tagged to their respective properties
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-lg border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Payment</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Client</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Amount</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredPayments.map((payment) => (
                        <tr key={payment.id || payment._id} className="hover:bg-gray-50" data-testid={`payment-row-${payment.id || payment._id}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                                <DollarSign className="h-5 w-5 text-indigo-600" />
                              </div>
                              <div>
                                <p className="font-medium text-gray-800">{payment.reference || 'Payment'}</p>
                                <p className="text-xs text-gray-500">{payment.type || 'Real Estate'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-gray-700">{payment.client_name || '-'}</p>
                            <p className="text-xs text-gray-500">{payment.client_email || '-'}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-800">{formatCurrency(payment.amount)}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {payment.date 
                              ? new Date(payment.date).toLocaleDateString() 
                              : '-'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end">
                              <Button
                                size="sm"
                                className="bg-indigo-600 hover:bg-indigo-700"
                                onClick={() => toast.info("Tag to property modal coming soon")}
                                data-testid={`tag-btn-${payment.id || payment._id}`}
                              >
                                <Link2 className="h-4 w-4 mr-1" />
                                Tag to Property
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          ) : activeTab === "interest" ? (
            /* Interest Tab */
            filteredInterests.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg border">
                <TrendingUp className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 mb-2">No interest requests</p>
                <p className="text-sm text-gray-400">
                  Investor interest in your properties will appear here
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-lg border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Investor</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Property</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Contact</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredInterests.map((interest) => (
                        <tr key={interest.id || interest._id} className="hover:bg-gray-50" data-testid={`interest-row-${interest.id || interest._id}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                                <span className="text-green-600 font-bold">
                                  {interest.client_name?.charAt(0) || 'I'}
                                </span>
                              </div>
                              <div>
                                <p className="font-medium text-gray-800">{interest.client_name || 'Anonymous'}</p>
                                <p className="text-xs text-gray-500">{interest.pan || '-'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-gray-700">{interest.property_name || '-'}</p>
                            <p className="text-xs text-gray-500">{interest.unit_no ? `Unit ${interest.unit_no}` : '-'}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-gray-700">{interest.email || '-'}</p>
                            <p className="text-xs text-gray-500">{interest.phone || '-'}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {interest.created_at 
                              ? new Date(interest.created_at).toLocaleDateString() 
                              : '-'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              interest.status === 'converted' 
                                ? 'bg-green-100 text-green-700'
                                : interest.status === 'contacted'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-yellow-100 text-yellow-700'
                            }`}>
                              {interest.status === 'converted' ? 'Converted' 
                                : interest.status === 'contacted' ? 'Contacted' 
                                : 'New'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toast.info("View details coming soon")}
                                data-testid={`view-interest-${interest.id || interest._id}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {interest.status !== 'contacted' && interest.status !== 'converted' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleMarkContacted(interest.id || interest._id)}
                                  data-testid={`contacted-btn-${interest.id || interest._id}`}
                                >
                                  Contacted
                                </Button>
                              )}
                              {interest.status !== 'converted' && (
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700"
                                  onClick={() => handleMarkConverted(interest.id || interest._id)}
                                  data-testid={`converted-btn-${interest.id || interest._id}`}
                                >
                                  <Check className="h-4 w-4 mr-1" />
                                  Converted
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
