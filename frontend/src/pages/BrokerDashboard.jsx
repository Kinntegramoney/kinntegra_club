import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Plus, LogOut, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function BrokerDashboard() {
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
    if (parsedUser.role !== "broker") {
      navigate("/sub-broker/dashboard");
      return;
    }
    
    setUser(parsedUser);
    fetchBonds();
  }, [navigate]);

  const fetchBonds = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/bonds`, {
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
                <h1 className="text-2xl font-bold" data-testid="broker-dashboard-title">Broker Dashboard</h1>
                <p className="text-sm text-purple-200">Welcome, {user.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                data-testid="create-bond-broker-btn"
                onClick={() => navigate("/bonds/create")}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Bond
              </Button>
              <Button
                data-testid="logout-btn"
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
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Loading bonds...</p>
          </div>
        ) : bonds.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <TrendingUp className="h-16 w-16 text-muted-foreground" />
            <h2 className="text-xl font-semibold">No bonds yet</h2>
            <p className="text-muted-foreground">Create your first bond to get started</p>
            <Button
              onClick={() => navigate("/bonds/create")}
              className="mt-4 bg-orange-500 hover:bg-orange-600 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Bond
            </Button>
          </div>
        ) : (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-semibold">Your Bonds</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Manage all bond offerings
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {bonds.map((bond) => (
                <div
                  key={bond.id}
                  className="bg-white border border-border rounded-md p-4 hover:border-orange-500 transition-colors cursor-pointer"
                  data-testid={`bond-card-${bond.id}`}
                  onClick={() => navigate(`/bonds/${bond.id}`)}
                >
                  <h3 className="text-lg font-semibold mb-3">{bond.name}</h3>
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
                      <span className="text-muted-foreground">Secondary IRR:</span>
                      <span className="font-mono font-medium text-orange-600">{bond.secondary_irr}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Units:</span>
                      <span className="font-mono font-medium">
                        {(bond.total_units || 1) - (bond.units_sold || 0)}/{bond.total_units || 1}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-4"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/bonds/${bond.id}`);
                    }}
                  >
                    View Details
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}