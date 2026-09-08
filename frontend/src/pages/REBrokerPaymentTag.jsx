import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Tag, RefreshCw, Search, Building2, DollarSign, Calendar, Link2 } from "lucide-react";
import REBrokerSidebar from "@/components/REBrokerSidebar";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function REBrokerPaymentTag() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [brokerProfile, setBrokerProfile] = useState(null);
  const [untaggedPayments, setUntaggedPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    document.title = "Kinntegraa | RE Broker - Payment Tag";
    
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
    fetchUntaggedPayments(token);
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

  const fetchUntaggedPayments = useCallback(async (token) => {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }, []);

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

  const filteredPayments = untaggedPayments.filter(payment => {
    const query = searchQuery.toLowerCase();
    return (
      payment.client_name?.toLowerCase().includes(query) ||
      payment.reference?.toLowerCase().includes(query) ||
      payment.amount?.toString().includes(query)
    );
  });

  const formatCurrency = (amount, currency = 'AED') => {
    if (!amount) return '-';
    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
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
                <Tag className="h-6 w-6 text-indigo-600" />
                Payment Tag - Real Estate
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Tag payments to real estate opportunities ({filteredPayments.length} untagged)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search payments..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-[250px]"
                  data-testid="search-input"
                />
              </div>
              <Button variant="outline" onClick={() => fetchUntaggedPayments()} data-testid="refresh-btn">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 md:p-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : filteredPayments.length === 0 ? (
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
          )}
        </div>
      </div>
    </div>
  );
}
