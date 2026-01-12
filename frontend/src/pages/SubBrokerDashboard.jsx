import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { LogOut, TrendingUp, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function SubBrokerDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [bonds, setBonds] = useState([]);
  const [loading, setLoading] = useState(true);

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
    fetchBonds();
  }, [navigate]);

  const fetchBonds = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/bonds/available`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBonds(response.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching bonds:", error);
      toast.error("Failed to load bonds");
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
    toast.success("Logged out successfully");
  };

  const handleShareBond = (bond) => {
    const shareText = `Investment Opportunity: ${bond.name}\n\nPrincipal: ₹${bond.principal_amount.toLocaleString()}\nIRR: ${bond.secondary_irr}%\nUnits Available: ${(bond.total_units || 1) - (bond.units_sold || 0)}\n\nView details and calculate returns!`;
    
    if (navigator.share) {
      navigator.share({
        title: bond.name,
        text: shareText
      }).catch(() => {
        // Fallback to clipboard
        navigator.clipboard.writeText(shareText);
        toast.success("Bond details copied to clipboard!");
      });
    } else {
      navigator.clipboard.writeText(shareText);
      toast.success("Bond details copied to clipboard!");
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900 to-purple-800 text-white shadow-lg">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                <span className="text-white text-xl font-bold">K</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold" data-testid="sub-broker-dashboard-title">Sub-Broker Dashboard</h1>
                <p className="text-sm text-purple-200">Welcome, {user.name}</p>
              </div>
            </div>
            <Button
              data-testid="logout-btn-sub"
              onClick={handleLogout}
              variant="outline"
              className="border-white text-white hover:bg-white/10"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Loading opportunities...</p>
          </div>
        ) : bonds.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <TrendingUp className="h-16 w-16 text-muted-foreground" />
            <h2 className="text-xl font-semibold">No bonds available</h2>
            <p className="text-muted-foreground">Check back later for new investment opportunities</p>
          </div>
        ) : (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-semibold">Available Investment Opportunities</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Share these opportunities with your clients
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {bonds.map((bond) => {
                const unitsAvailable = (bond.total_units || 1) - (bond.units_sold || 0);
                
                return (
                  <div
                    key={bond.id}
                    className="bg-white border border-border rounded-md p-4 hover:border-orange-500 transition-colors"
                    data-testid={`bond-card-${bond.id}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-lg font-semibold">{bond.name}</h3>
                      {unitsAvailable > 0 && (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                          Available
                        </span>
                      )}
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Principal:</span>
                        <span className="font-mono font-medium">₹{bond.principal_amount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Coupon Rate:</span>
                        <span className="font-mono font-medium">{bond.coupon_rate}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">IRR (Gross):</span>
                        <span className="font-mono font-medium text-orange-600 text-base">{bond.secondary_irr}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Units Available:</span>
                        <span className="font-mono font-medium">{unitsAvailable}/{bond.total_units || 1}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Maturity:</span>
                        <span className="font-mono text-xs">{new Date(bond.end_date).toLocaleDateString()}</span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/bonds/${bond.id}`)}
                        data-testid={`view-bond-${bond.id}`}
                      >
                        Calculate
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleShareBond(bond)}
                        className="bg-orange-500 hover:bg-orange-600 text-white"
                        data-testid={`share-bond-${bond.id}`}
                      >
                        <Share2 className="h-4 w-4 mr-1" />
                        Share
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
