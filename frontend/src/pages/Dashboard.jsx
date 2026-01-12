import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Calculator, TrendingUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Dashboard() {
  const navigate = useNavigate();
  const [bonds, setBonds] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBonds();
  }, []);

  const fetchBonds = async () => {
    try {
      const response = await axios.get(`${API}/bonds`);
      setBonds(response.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching bonds:", error);
      toast.error("Failed to load bonds");
      setLoading(false);
    }
  };

  const deleteBond = async (bondId, bondName) => {
    if (!window.confirm(`Delete bond "${bondName}"?`)) return;
    
    try {
      await axios.delete(`${API}/bonds/${bondId}`);
      toast.success("Bond deleted successfully");
      fetchBonds();
    } catch (error) {
      console.error("Error deleting bond:", error);
      toast.error("Failed to delete bond");
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-border bg-primary text-primary-foreground">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Calculator className="h-8 w-8" />
              <h1 className="text-2xl font-bold tracking-tight" data-testid="dashboard-title">BondFlow Pro</h1>
            </div>
            <Button
              data-testid="create-bond-btn"
              onClick={() => navigate("/bonds/create")}
              className="btn-scale bg-accent text-white hover:bg-accent/90"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Bond
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center h-64" data-testid="loading-state">
            <p className="text-muted-foreground">Loading bonds...</p>
          </div>
        ) : bonds.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4" data-testid="empty-state">
            <TrendingUp className="h-16 w-16 text-muted-foreground" />
            <h2 className="text-xl font-semibold">No bonds yet</h2>
            <p className="text-muted-foreground">Create your first bond to get started</p>
            <Button
              data-testid="empty-create-bond-btn"
              onClick={() => navigate("/bonds/create")}
              className="btn-scale mt-4 bg-accent text-white hover:bg-accent/90"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Bond
            </Button>
          </div>
        ) : (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-semibold tracking-tight">Your Bonds</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Manage and calculate secondary market prices
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {bonds.map((bond) => {
                const startDate = new Date(bond.start_date);
                const endDate = new Date(bond.end_date);
                const daysToMaturity = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
                const isActive = new Date() >= startDate && new Date() <= endDate;

                return (
                  <div
                    key={bond.id}
                    className="metric-card rounded-md cursor-pointer"
                    data-testid={`bond-card-${bond.id}`}
                    onClick={() => navigate(`/bonds/${bond.id}`)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-lg font-semibold" data-testid={`bond-name-${bond.id}`}>{bond.name}</h3>
                      <button
                        data-testid={`delete-bond-${bond.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteBond(bond.id, bond.name);
                        }}
                        className="text-destructive hover:text-destructive/80 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Principal:</span>
                        <span className="font-mono font-medium" data-testid={`bond-principal-${bond.id}`}>
                          ₹{bond.principal_amount.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Coupon Rate:</span>
                        <span className="font-mono font-medium">{bond.coupon_rate}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Primary IRR:</span>
                        <span className="font-mono font-medium text-success">{bond.primary_irr}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Secondary IRR:</span>
                        <span className="font-mono font-medium text-accent">{bond.secondary_irr}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Status:</span>
                        <span className={`font-medium ${isActive ? 'text-success' : 'text-muted-foreground'}`}>
                          {isActive ? 'Active' : daysToMaturity > 0 ? 'Upcoming' : 'Matured'}
                        </span>
                      </div>
                      {isActive && daysToMaturity > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Days to Maturity:</span>
                          <span className="font-mono font-medium">{daysToMaturity}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-border">
                      <Button
                        data-testid={`view-bond-${bond.id}`}
                        variant="outline"
                        size="sm"
                        className="w-full btn-scale"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/bonds/${bond.id}`);
                        }}
                      >
                        View & Calculate
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