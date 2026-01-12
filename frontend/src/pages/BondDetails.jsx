import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Calculator, TrendingUp, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function BondDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bond, setBond] = useState(null);
  const [loading, setLoading] = useState(true);
  const [investmentDate, setInvestmentDate] = useState("");
  const [calculation, setCalculation] = useState(null);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    fetchBond();
  }, [id]);

  const fetchBond = async () => {
    try {
      const response = await axios.get(`${API}/bonds/${id}`);
      setBond(response.data);
      setLoading(false);
      
      // Set default investment date to today if within bond period
      const today = new Date().toISOString().split('T')[0];
      const startDate = response.data.bond.start_date;
      const endDate = response.data.bond.end_date;
      
      if (today >= startDate && today <= endDate) {
        setInvestmentDate(today);
      } else if (today < startDate) {
        setInvestmentDate(startDate);
      }
    } catch (error) {
      console.error("Error fetching bond:", error);
      toast.error("Failed to load bond details");
      setLoading(false);
    }
  };

  const calculatePrice = async () => {
    if (!investmentDate) {
      toast.error("Please select an investment date");
      return;
    }

    setCalculating(true);
    try {
      const response = await axios.post(`${API}/bonds/${id}/calculate`, {
        investment_date: investmentDate
      });
      setCalculation(response.data);
      toast.success("Price calculated successfully!");
    } catch (error) {
      console.error("Error calculating price:", error);
      toast.error(error.response?.data?.detail || "Failed to calculate price");
    } finally {
      setCalculating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center" data-testid="loading-bond-details">
        <p className="text-muted-foreground">Loading bond details...</p>
      </div>
    );
  }

  if (!bond) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">Bond not found</p>
          <Button onClick={() => navigate("/")}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  const { bond: bondData, total_cashflows_primary, calculated_primary_irr } = bond;

  // Prepare chart data
  const chartData = [];
  
  // Add interest payments
  bondData.interest_payments.forEach(ip => {
    chartData.push({
      date: format(new Date(ip.date), "MMM dd, yyyy"),
      dateValue: new Date(ip.date).getTime(),
      Interest: ip.amount,
      Principal: 0
    });
  });

  // Add principal payments
  bondData.principal_payments.forEach(pp => {
    const amount = bondData.principal_amount * pp.percentage / 100;
    const existing = chartData.find(d => d.dateValue === new Date(pp.date).getTime());
    if (existing) {
      existing.Principal = amount;
    } else {
      chartData.push({
        date: format(new Date(pp.date), "MMM dd, yyyy"),
        dateValue: new Date(pp.date).getTime(),
        Interest: 0,
        Principal: amount
      });
    }
  });

  chartData.sort((a, b) => a.dateValue - b.dateValue);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-border bg-primary text-primary-foreground">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <Button
              data-testid="back-to-dashboard-from-details"
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="text-primary-foreground hover:bg-primary-foreground/10"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Calculator className="h-8 w-8" />
            <h1 className="text-2xl font-bold tracking-tight" data-testid="bond-details-title">{bondData.name}</h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Bond Summary */}
          <div className="lg:col-span-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="metric-card rounded-md">
                <p className="text-xs text-muted-foreground mb-1">Principal Amount</p>
                <p className="text-2xl font-mono font-bold" data-testid="bond-principal-display">₹{bondData.principal_amount.toLocaleString()}</p>
              </div>
              <div className="metric-card rounded-md">
                <p className="text-xs text-muted-foreground mb-1">Coupon Rate</p>
                <p className="text-2xl font-mono font-bold">{bondData.coupon_rate}%</p>
              </div>
              <div className="metric-card rounded-md">
                <p className="text-xs text-muted-foreground mb-1">Primary IRR</p>
                <p className="text-2xl font-mono font-bold text-success">{bondData.primary_irr}%</p>
                {calculated_primary_irr && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Calculated: <span className="font-mono">{calculated_primary_irr.toFixed(2)}%</span>
                  </p>
                )}
              </div>
              <div className="metric-card rounded-md">
                <p className="text-xs text-muted-foreground mb-1">Secondary IRR</p>
                <p className="text-2xl font-mono font-bold text-accent">{bondData.secondary_irr}%</p>
              </div>
            </div>
          </div>

          {/* Cashflow Timeline */}
          <div className="lg:col-span-3 metric-card rounded-md">
            <h2 className="text-xl font-semibold mb-4">Cashflow Timeline</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} />
                <Tooltip 
                  contentStyle={{ fontFamily: 'JetBrains Mono', fontSize: 12 }}
                  formatter={(value) => `₹${value.toLocaleString()}`}
                />
                <Legend />
                <Bar dataKey="Interest" fill="#2563EB" />
                <Bar dataKey="Principal" fill="#10B981" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Payment Schedules */}
          <div className="lg:col-span-1 metric-card rounded-md">
            <h3 className="text-lg font-semibold mb-3">Principal Payments</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {bondData.principal_payments.map((pp, index) => (
                <div key={index} className="flex justify-between text-sm pb-2 border-b border-border last:border-0">
                  <span className="font-mono text-muted-foreground">{format(new Date(pp.date), "MMM dd, yyyy")}</span>
                  <span className="font-mono font-medium">{pp.percentage}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 metric-card rounded-md">
            <h3 className="text-lg font-semibold mb-3">Interest Payments</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              <table className="w-full data-grid">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {bondData.interest_payments.map((ip, index) => (
                    <tr key={index}>
                      <td>{format(new Date(ip.date), "MMM dd, yyyy")}</td>
                      <td className="text-right">₹{ip.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Secondary Market Calculator */}
          <div className="lg:col-span-3 metric-card rounded-md bg-surface">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-6 w-6 text-accent" />
              <h2 className="text-xl font-semibold">Secondary Market Calculator</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="space-y-2">
                <Label htmlFor="investment_date">Investment Date</Label>
                <Input
                  data-testid="investment-date-input"
                  id="investment_date"
                  type="date"
                  value={investmentDate}
                  onChange={(e) => setInvestmentDate(e.target.value)}
                  min={bondData.start_date}
                  max={bondData.end_date}
                />
              </div>
              <div className="flex items-end">
                <Button
                  data-testid="calculate-price-btn"
                  onClick={calculatePrice}
                  disabled={calculating}
                  className="btn-scale w-full bg-accent text-white hover:bg-accent/90"
                >
                  <Calculator className="h-4 w-4 mr-2" />
                  {calculating ? "Calculating..." : "Calculate Price"}
                </Button>
              </div>
            </div>

            {calculation && (
              <div className="mt-6 pt-6 border-t border-border">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">Price to Pay</p>
                    <p className="text-2xl font-mono font-bold text-accent" data-testid="calculated-price">₹{calculation.price_to_pay.toLocaleString()}</p>
                  </div>
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">Primary Buyer Gets</p>
                    <p className="text-2xl font-mono font-bold" data-testid="primary-buyer-proceeds">₹{calculation.primary_buyer_proceeds.toLocaleString()}</p>
                  </div>
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">Broker Margin</p>
                    <p className={`text-2xl font-mono font-bold ${calculation.broker_margin >= 0 ? 'text-success' : 'text-destructive'}`} data-testid="broker-margin">
                      ₹{calculation.broker_margin.toLocaleString()}
                    </p>
                  </div>
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">Days to Maturity</p>
                    <p className="text-2xl font-mono font-bold">{calculation.days_to_maturity}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">Remaining Principal</p>
                    <p className="text-lg font-mono font-medium">₹{calculation.remaining_principal.toLocaleString()}</p>
                  </div>
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">Remaining Interest</p>
                    <p className="text-lg font-mono font-medium">₹{calculation.remaining_interest.toLocaleString()}</p>
                  </div>
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">Total Future Inflows</p>
                    <p className="text-lg font-mono font-medium">₹{calculation.total_inflows.toLocaleString()}</p>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-white border border-border rounded-md">
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-success" />
                    Transaction Summary
                  </h3>
                  <div className="space-y-1 text-sm">
                    <p>Secondary buyer pays <span className="font-mono font-medium text-accent">₹{calculation.price_to_pay.toLocaleString()}</span> on {format(new Date(calculation.investment_date), "MMM dd, yyyy")}</p>
                    <p>Primary buyer receives <span className="font-mono font-medium">₹{calculation.primary_buyer_proceeds.toLocaleString()}</span> achieving their {bondData.primary_irr}% IRR</p>
                    <p>Broker earns <span className={`font-mono font-medium ${calculation.broker_margin >= 0 ? 'text-success' : 'text-destructive'}`}>₹{calculation.broker_margin.toLocaleString()}</span> as margin</p>
                    <p>Secondary buyer will earn <span className="font-mono font-medium text-accent">{calculation.secondary_buyer_irr}%</span> IRR guaranteed</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}