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
  const [approximateAmount, setApproximateAmount] = useState("");
  const [selectedUnits, setSelectedUnits] = useState(null);
  const [downloading, setDownloading] = useState(false);

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

  const calculatePrice = async (units) => {
    if (!investmentDate) {
      toast.error("Please select an investment date");
      return;
    }

    if (!units || units < 1) {
      toast.error("Please select number of units");
      return;
    }

    setCalculating(true);
    setSelectedUnits(units);
    try {
      const response = await axios.post(`${API}/bonds/${id}/calculate`, {
        investment_date: investmentDate,
        units: units
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

  const downloadCashflow = async () => {
    if (!calculation || !selectedUnits) {
      toast.error("Please calculate price first");
      return;
    }

    setDownloading(true);
    try {
      const response = await axios.post(`${API}/bonds/${id}/download-cashflow`, {
        investment_date: investmentDate,
        units: selectedUnits
      });
      
      // Create CSV content WITHOUT rupee symbol to avoid encoding issues
      const data = response.data;
      let csv = `Bond Name,${data.bond_name}\n`;
      csv += `Investment Date,${data.investment_date}\n`;
      csv += `Units,${data.units}\n`;
      csv += `Price Paid,${data.price_paid.toFixed(2)}\n\n`;
      csv += `Date,Month,Principal Payment,Interest Payment,TDS Deducted (10%),Net Interest,Total Net Payment\n`;
      
      data.cashflows.forEach(cf => {
        csv += `${cf.date},${cf.month},${cf.principal_payment.toFixed(2)},${cf.interest_payment.toFixed(2)},${cf.tds_deducted.toFixed(2)},${cf.net_interest.toFixed(2)},${cf.total_net_payment.toFixed(2)}\n`;
      });
      
      csv += `\nSummary\n`;
      csv += `Total Principal,${data.total_principal.toFixed(2)}\n`;
      csv += `Total Interest,${data.total_interest.toFixed(2)}\n`;
      csv += `Total TDS,${data.total_tds.toFixed(2)}\n`;
      csv += `Total Net Received,${data.total_net_received.toFixed(2)}\n`;
      csv += `\nNote: All amounts are in INR (Indian Rupees)\n`;
      
      // Download CSV
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cashflow_${bondData.name.replace(/\s+/g, '_')}_${data.investment_date}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.success("Cashflow downloaded successfully!");
    } catch (error) {
      console.error("Error downloading cashflow:", error);
      toast.error("Failed to download cashflow");
    } finally {
      setDownloading(false);
    }
  };

  const formatINR = (amount) => {
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getLowerBoundUnits = () => {
    if (!approximateAmount || !calculation || !calculation.price_per_unit) return null;
    return Math.floor(parseFloat(approximateAmount) / calculation.price_per_unit);
  };

  const getUpperBoundUnits = () => {
    if (!approximateAmount || !calculation || !calculation.price_per_unit) return null;
    return Math.ceil(parseFloat(approximateAmount) / calculation.price_per_unit);
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
              <div className="metric-card rounded-md">
                <p className="text-xs text-muted-foreground mb-1">Units Available</p>
                <p className="text-2xl font-mono font-bold" data-testid="units-available">
                  {(bondData.total_units || 1) - (bondData.units_sold || 0)}/{bondData.total_units || 1}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Sold: {bondData.units_sold || 0}
                </p>
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
                  onChange={(e) => {
                    setInvestmentDate(e.target.value);
                    setCalculation(null);
                    setSelectedUnits(null);
                  }}
                  min={bondData.start_date}
                  max={bondData.end_date}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="approximate_amount">Approximate Investment (₹)</Label>
                <Input
                  data-testid="approximate-amount-input"
                  id="approximate_amount"
                  type="number"
                  value={approximateAmount}
                  onChange={(e) => setApproximateAmount(e.target.value)}
                  placeholder="e.g., 1000000"
                />
              </div>
              <div className="flex items-end">
                <Button
                  data-testid="check-bounds-btn"
                  onClick={() => calculatePrice(1)}
                  disabled={calculating || !approximateAmount || !investmentDate}
                  className="btn-scale w-full bg-accent text-white hover:bg-accent/90"
                >
                  <Calculator className="h-4 w-4 mr-2" />
                  {calculating ? "Calculating..." : "Check Bounds"}
                </Button>
              </div>
            </div>

            {/* Unit bounds display with selection */}
            {approximateAmount && calculation && calculation.price_per_unit > 0 && (
              <div className="mb-4 p-4 bg-white border border-border rounded-md">
                <p className="text-sm font-medium mb-3">For approximate amount of ₹{parseFloat(approximateAmount).toLocaleString('en-IN')}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 border border-border rounded-md hover:border-accent transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-muted-foreground">Lower Bound</span>
                      <Button
                        data-testid="select-lower-bound-btn"
                        size="sm"
                        onClick={() => calculatePrice(getLowerBoundUnits())}
                        disabled={calculating || getLowerBoundUnits() < 1 || getLowerBoundUnits() > calculation.units_available}
                        className="btn-scale"
                      >
                        Select
                      </Button>
                    </div>
                    <p className="text-lg font-mono font-bold" data-testid="lower-bound-units">
                      {getLowerBoundUnits()} unit{getLowerBoundUnits() !== 1 ? 's' : ''}
                    </p>
                    <p className="text-sm text-muted-foreground font-mono">
                      ₹{(getLowerBoundUnits() * calculation.price_per_unit).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="p-3 border border-border rounded-md hover:border-accent transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-muted-foreground">Upper Bound</span>
                      <Button
                        data-testid="select-upper-bound-btn"
                        size="sm"
                        onClick={() => calculatePrice(getUpperBoundUnits())}
                        disabled={calculating || getUpperBoundUnits() < 1 || getUpperBoundUnits() > calculation.units_available}
                        className="btn-scale"
                      >
                        Select
                      </Button>
                    </div>
                    <p className="text-lg font-mono font-bold" data-testid="upper-bound-units">
                      {getUpperBoundUnits()} unit{getUpperBoundUnits() !== 1 ? 's' : ''}
                    </p>
                    <p className="text-sm text-muted-foreground font-mono">
                      ₹{(getUpperBoundUnits() * calculation.price_per_unit).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Select lower or upper bound to calculate exact price and cashflow
                </p>
              </div>
            )}

            {calculation && selectedUnits && (
              <div className="mt-6 pt-6 border-t border-border">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">Units Selected</p>
                    <p className="text-2xl font-mono font-bold">{calculation.units_requested}</p>
                  </div>
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">Price per Unit</p>
                    <p className="text-2xl font-mono font-bold text-accent" data-testid="price-per-unit">₹{calculation.price_per_unit.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">Total Investment</p>
                    <p className="text-2xl font-mono font-bold text-accent" data-testid="total-price">₹{calculation.total_price.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">Days to Maturity</p>
                    <p className="text-2xl font-mono font-bold">{calculation.days_to_maturity}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">Remaining Principal</p>
                    <p className="text-lg font-mono font-medium">₹{(calculation.remaining_principal * calculation.units_requested).toLocaleString('en-IN')}</p>
                  </div>
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">Remaining Interest</p>
                    <p className="text-lg font-mono font-medium">₹{(calculation.remaining_interest * calculation.units_requested).toLocaleString('en-IN')}</p>
                  </div>
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">TDS @ {calculation.tds_rate}%</p>
                    <p className="text-lg font-mono font-medium text-destructive">₹{(calculation.remaining_interest * calculation.units_requested * calculation.tds_rate / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">Net Receivable</p>
                    <p className="text-lg font-mono font-medium text-success">
                      ₹{((calculation.remaining_principal * calculation.units_requested) + (calculation.remaining_interest * calculation.units_requested * (1 - calculation.tds_rate / 100))).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-white border border-border rounded-md">
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-success" />
                    Investment Summary
                  </h3>
                  <div className="space-y-1 text-sm">
                    <p>Total investment: <span className="font-mono font-medium text-accent">₹{calculation.total_price.toLocaleString('en-IN')}</span> for <span className="font-mono font-medium">{calculation.units_requested}</span> unit(s) on {format(new Date(calculation.investment_date), "MMM dd, yyyy")}</p>
                    <p>Total future inflows: <span className="font-mono font-medium">₹{(calculation.total_inflows * calculation.units_requested).toLocaleString('en-IN')}</span> (before TDS)</p>
                    <p>TDS deduction: <span className="font-mono font-medium text-destructive">₹{(calculation.remaining_interest * calculation.units_requested * calculation.tds_rate / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> (10% on interest)</p>
                    <p>Net amount receivable: <span className="font-mono font-medium text-success">₹{((calculation.remaining_principal * calculation.units_requested) + (calculation.remaining_interest * calculation.units_requested * (1 - calculation.tds_rate / 100))).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
                    <p>Guaranteed return: <span className="font-mono font-medium text-accent">{calculation.secondary_buyer_irr}%</span> IRR</p>
                  </div>
                  <div className="mt-4">
                    <Button
                      data-testid="download-cashflow-btn"
                      onClick={downloadCashflow}
                      disabled={downloading}
                      className="btn-scale bg-primary text-primary-foreground"
                    >
                      {downloading ? "Downloading..." : "Download Monthly Cashflow (CSV)"}
                    </Button>
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