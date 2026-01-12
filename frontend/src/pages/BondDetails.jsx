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
  const [saleUnits, setSaleUnits] = useState(1);
  const [recordingSale, setRecordingSale] = useState(false);
  const [purchaseUnits, setPurchaseUnits] = useState(1);
  const [approximateAmount, setApproximateAmount] = useState("");
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

  const calculatePrice = async () => {
    if (!investmentDate) {
      toast.error("Please select an investment date");
      return;
    }

    if (purchaseUnits < 1) {
      toast.error("Please enter valid number of units");
      return;
    }

    setCalculating(true);
    try {
      const response = await axios.post(`${API}/bonds/${id}/calculate`, {
        investment_date: investmentDate,
        units: purchaseUnits
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
    if (!calculation) {
      toast.error("Please calculate price first");
      return;
    }

    setDownloading(true);
    try {
      const response = await axios.post(`${API}/bonds/${id}/download-cashflow`, {
        investment_date: investmentDate,
        units: purchaseUnits
      });
      
      // Create CSV content
      const data = response.data;
      let csv = `Bond Name:,${data.bond_name}\n`;
      csv += `Investment Date:,${format(new Date(data.investment_date), "MMM dd, yyyy")}\n`;
      csv += `Units:,${data.units}\n`;
      csv += `Price Paid:,₹${data.price_paid.toLocaleString()}\n\n`;
      csv += `Date,Month,Principal Payment,Interest Payment,TDS Deducted (10%),Net Interest,Total Net Payment\n`;
      
      data.cashflows.forEach(cf => {
        csv += `${format(new Date(cf.date), "dd-MMM-yyyy")},${cf.month},₹${cf.principal_payment.toLocaleString()},₹${cf.interest_payment.toLocaleString()},₹${cf.tds_deducted.toLocaleString()},₹${cf.net_interest.toLocaleString()},₹${cf.total_net_payment.toLocaleString()}\n`;
      });
      
      csv += `\nTotals,,,,,\n`;
      csv += `Total Principal:,₹${data.total_principal.toLocaleString()}\n`;
      csv += `Total Interest:,₹${data.total_interest.toLocaleString()}\n`;
      csv += `Total TDS:,₹${data.total_tds.toLocaleString()}\n`;
      csv += `Total Net Received:,₹${data.total_net_received.toLocaleString()}\n`;
      
      // Download CSV
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cashflow_${bondData.name}_${format(new Date(investmentDate), "yyyy-MM-dd")}.csv`;
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

  const handleApproximateAmountChange = (value) => {
    setApproximateAmount(value);
    if (value && calculation && calculation.price_per_unit > 0) {
      const amount = parseFloat(value);
      const estimatedUnits = Math.floor(amount / calculation.price_per_unit);
      // Auto-update purchase units if reasonable
      if (estimatedUnits > 0 && estimatedUnits <= calculation.units_available) {
        setPurchaseUnits(estimatedUnits);
      }
    }
  };

  const recordSale = async () => {
    if (saleUnits < 1) {
      toast.error("Please enter a valid number of units");
      return;
    }

    setRecordingSale(true);
    try {
      const response = await axios.post(`${API}/bonds/${id}/record-sale`, {
        units: saleUnits
      });
      toast.success(response.data.message);
      fetchBond(); // Refresh bond data
      setSaleUnits(1);
    } catch (error) {
      console.error("Error recording sale:", error);
      toast.error(error.response?.data?.detail || "Failed to record sale");
    } finally {
      setRecordingSale(false);
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
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
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
              <div className="space-y-2">
                <Label htmlFor="purchase_units">Units to Purchase</Label>
                <Input
                  data-testid="purchase-units-input"
                  id="purchase_units"
                  type="number"
                  min="1"
                  max={bondData.total_units - bondData.units_sold}
                  value={purchaseUnits}
                  onChange={(e) => setPurchaseUnits(parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="approximate_amount">Approximate Amount (₹)</Label>
                <Input
                  data-testid="approximate-amount-input"
                  id="approximate_amount"
                  type="number"
                  value={approximateAmount}
                  onChange={(e) => handleApproximateAmountChange(e.target.value)}
                  placeholder="e.g., 1000000"
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
                  {calculating ? "Calculating..." : "Calculate"}
                </Button>
              </div>
            </div>

            {/* Unit bounds display */}
            {approximateAmount && calculation && calculation.price_per_unit > 0 && (
              <div className="mb-4 p-3 bg-white border border-border rounded-md">
                <p className="text-sm text-muted-foreground mb-2">For ₹{parseFloat(approximateAmount).toLocaleString()}</p>
                <div className="flex gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Lower Bound: </span>
                    <span className="font-mono font-medium" data-testid="lower-bound-units">
                      {Math.floor(parseFloat(approximateAmount) / calculation.price_per_unit)} units
                    </span>
                    <span className="text-muted-foreground ml-1">
                      (₹{(Math.floor(parseFloat(approximateAmount) / calculation.price_per_unit) * calculation.price_per_unit).toLocaleString()})
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Upper Bound: </span>
                    <span className="font-mono font-medium" data-testid="upper-bound-units">
                      {Math.ceil(parseFloat(approximateAmount) / calculation.price_per_unit)} units
                    </span>
                    <span className="text-muted-foreground ml-1">
                      (₹{(Math.ceil(parseFloat(approximateAmount) / calculation.price_per_unit) * calculation.price_per_unit).toLocaleString()})
                    </span>
                  </div>
                </div>
              </div>
            )}

            {calculation && (
              <div className="mt-6 pt-6 border-t border-border">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">Price to Pay</p>
                    <p className="text-2xl font-mono font-bold text-accent" data-testid="calculated-price">₹{calculation.price_to_pay.toLocaleString()}</p>
                  </div>
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">Days to Maturity</p>
                    <p className="text-2xl font-mono font-bold">{calculation.days_to_maturity}</p>
                  </div>
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">Units Available</p>
                    <p className="text-2xl font-mono font-bold text-success" data-testid="calc-units-available">{calculation.units_available}</p>
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
                    Investment Summary
                  </h3>
                  <div className="space-y-1 text-sm">
                    <p>Secondary buyer invests <span className="font-mono font-medium text-accent">₹{calculation.price_to_pay.toLocaleString()}</span> on {format(new Date(calculation.investment_date), "MMM dd, yyyy")}</p>
                    <p>Will receive <span className="font-mono font-medium">₹{calculation.total_inflows.toLocaleString()}</span> in future cashflows</p>
                    <p>Guaranteed return: <span className="font-mono font-medium text-accent">{calculation.secondary_buyer_irr}%</span> IRR</p>
                  </div>
                </div>

                {/* Record Sale Section */}
                {calculation.units_available > 0 && (
                  <div className="mt-6 p-4 bg-surface border border-border rounded-md">
                    <h3 className="font-semibold mb-3">Record Sale</h3>
                    <div className="flex gap-3 items-end">
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="sale_units">Number of Units to Sell</Label>
                        <Input
                          data-testid="sale-units-input"
                          id="sale_units"
                          type="number"
                          min="1"
                          max={calculation.units_available}
                          value={saleUnits}
                          onChange={(e) => setSaleUnits(parseInt(e.target.value) || 1)}
                        />
                      </div>
                      <Button
                        data-testid="record-sale-btn"
                        onClick={recordSale}
                        disabled={recordingSale || saleUnits < 1 || saleUnits > calculation.units_available}
                        className="btn-scale bg-success text-white hover:bg-success/90"
                      >
                        {recordingSale ? "Recording..." : "Record Sale"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Recording a sale will update the units available count
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}