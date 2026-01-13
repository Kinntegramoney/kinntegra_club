import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Plus, Trash2, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function CreateBond() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    bond_code: "",
    name: "",
    start_date: "",
    end_date: "",
    principal_amount: "",
    coupon_rate: "",
    primary_irr: "",
    secondary_irr: "",
    interest_payment_frequency: "quarterly",
    total_units: "1",
    minimum_units: "1",
    units_sold: "0"
  });

  const [principalPayments, setPrincipalPayments] = useState([{ date: "", percentage: "" }]);
  const [interestPayments, setInterestPayments] = useState([{ date: "", amount: "" }]);
  const [submitting, setSubmitting] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const addPrincipalPayment = () => {
    setPrincipalPayments([...principalPayments, { date: "", percentage: "" }]);
  };

  const removePrincipalPayment = (index) => {
    setPrincipalPayments(principalPayments.filter((_, i) => i !== index));
  };

  const updatePrincipalPayment = (index, field, value) => {
    const updated = [...principalPayments];
    updated[index][field] = value;
    setPrincipalPayments(updated);
  };

  const addInterestPayment = () => {
    setInterestPayments([...interestPayments, { date: "", amount: "" }]);
  };

  const removeInterestPayment = (index) => {
    setInterestPayments(interestPayments.filter((_, i) => i !== index));
  };

  const updateInterestPayment = (index, field, value) => {
    const updated = [...interestPayments];
    updated[index][field] = value;
    setInterestPayments(updated);
  };

  const generateInterestSchedule = () => {
    if (!formData.start_date || !formData.end_date || !formData.principal_amount || !formData.coupon_rate) {
      toast.error("Please fill in bond details first");
      return;
    }

    if (principalPayments.length === 0 || principalPayments.some(p => !p.date || !p.percentage)) {
      toast.error("Please add principal payment schedule first");
      return;
    }

    const start = new Date(formData.start_date);
    const end = new Date(formData.end_date);
    const principal = parseFloat(formData.principal_amount);
    const couponRate = parseFloat(formData.coupon_rate) / 100;
    const frequency = formData.interest_payment_frequency;

    // Determine payment interval in months
    let intervalMonths;
    switch (frequency) {
      case "monthly":
        intervalMonths = 1;
        break;
      case "quarterly":
        intervalMonths = 3;
        break;
      case "semi-annual":
        intervalMonths = 6;
        break;
      case "annual":
        intervalMonths = 12;
        break;
      default:
        toast.info("Using custom frequency. Add payments manually.");
        return;
    }

    // Sort principal payments by date
    const sortedPrincipalPayments = [...principalPayments]
      .filter(p => p.date && p.percentage)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    // Generate interest payment dates and calculate interest on reducing balance
    const schedule = [];
    let currentDate = new Date(start);
    let lastDate = start;
    let principalPaidSoFar = 0;

    while (currentDate < end) {
      // Move to next payment date
      currentDate = new Date(currentDate);
      currentDate.setMonth(currentDate.getMonth() + intervalMonths);
      
      if (currentDate > end) break;

      // Calculate outstanding principal at the START of this period
      const outstandingAtPeriodStart = principal * (1 - principalPaidSoFar / 100);
      
      // Calculate days in this period
      const daysDiff = Math.ceil((currentDate - lastDate) / (1000 * 60 * 60 * 24));
      
      // Calculate interest on the outstanding balance for this period
      const interestAmount = (outstandingAtPeriodStart * couponRate * daysDiff) / 365;
      
      schedule.push({
        date: format(currentDate, "yyyy-MM-dd"),
        amount: interestAmount > 0 ? interestAmount.toFixed(2) : "0.00"
      });

      // Update principal paid for NEXT period (check what was paid UP TO current date)
      sortedPrincipalPayments.forEach(pp => {
        const ppDate = new Date(pp.date);
        if (ppDate > lastDate && ppDate <= currentDate) {
          principalPaidSoFar += parseFloat(pp.percentage);
        }
      });

      lastDate = new Date(currentDate);
    }

    setInterestPayments(schedule);
    toast.success(`Generated ${schedule.length} interest payments based on outstanding principal`);
  };

  const validateForm = () => {
    // Check basic fields
    if (!formData.name || !formData.start_date || !formData.end_date || 
        !formData.principal_amount || !formData.coupon_rate || 
        !formData.primary_irr || !formData.secondary_irr) {
      toast.error("Please fill in all bond details");
      return false;
    }

    // Check principal payments
    const totalPrincipal = principalPayments.reduce((sum, p) => {
      return sum + (parseFloat(p.percentage) || 0);
    }, 0);

    if (Math.abs(totalPrincipal - 100) > 0.01) {
      toast.error(`Principal payments must sum to 100%. Current: ${totalPrincipal.toFixed(2)}%`);
      return false;
    }

    // Check if all principal payment dates are filled
    if (principalPayments.some(p => !p.date || !p.percentage)) {
      toast.error("Please fill in all principal payment dates and percentages");
      return false;
    }

    // Check interest payments
    if (interestPayments.length === 0 || interestPayments.some(i => !i.date || !i.amount)) {
      toast.error("Please add and fill in all interest payments");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setSubmitting(true);

    try {
      const bondData = {
        ...formData,
        principal_amount: parseFloat(formData.principal_amount),
        coupon_rate: parseFloat(formData.coupon_rate),
        primary_irr: parseFloat(formData.primary_irr),
        secondary_irr: parseFloat(formData.secondary_irr),
        total_units: parseInt(formData.total_units),
        minimum_units: parseInt(formData.minimum_units) || 1,
        units_sold: 0,
        principal_payments: principalPayments.map(p => ({
          date: p.date,
          percentage: parseFloat(p.percentage)
        })),
        interest_payments: interestPayments.map(i => ({
          date: i.date,
          amount: parseFloat(i.amount)
        }))
      };

      const response = await axios.post(`${API}/bonds`, bondData);
      toast.success("Bond created successfully!");
      navigate(`/bonds/${response.data.id}`);
    } catch (error) {
      console.error("Error creating bond:", error);
      toast.error(error.response?.data?.detail || "Failed to create bond");
      setSubmitting(false);
    }
  };

  const totalPrincipalPct = principalPayments.reduce((sum, p) => sum + (parseFloat(p.percentage) || 0), 0);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-border bg-primary text-primary-foreground">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <Button
              data-testid="back-to-dashboard"
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="text-primary-foreground hover:bg-primary-foreground/10"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Calculator className="h-8 w-8" />
            <h1 className="text-2xl font-bold tracking-tight" data-testid="create-bond-title">Create New Bond</h1>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="container mx-auto px-6 py-8 max-w-4xl">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Details */}
          <div className="metric-card rounded-md">
            <h2 className="text-xl font-semibold mb-4">Bond Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bond_code">Bond Code</Label>
                <Input
                  data-testid="bond-code-input"
                  id="bond_code"
                  name="bond_code"
                  value={formData.bond_code}
                  onChange={handleInputChange}
                  placeholder="e.g., ABC-NCD-2025"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Bond Name</Label>
                <Input
                  data-testid="bond-name-input"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g., ABC Corp NCD 2025"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="principal_amount">Principal Amount (₹)</Label>
                <Input
                  data-testid="principal-amount-input"
                  id="principal_amount"
                  name="principal_amount"
                  type="number"
                  value={formData.principal_amount}
                  onChange={handleInputChange}
                  placeholder="10,00,000"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="start_date">Start Date</Label>
                <Input
                  data-testid="start-date-input"
                  id="start_date"
                  name="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">Maturity Date</Label>
                <Input
                  data-testid="end-date-input"
                  id="end_date"
                  name="end_date"
                  type="date"
                  value={formData.end_date}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coupon_rate">Coupon Rate (%)</Label>
                <Input
                  data-testid="coupon-rate-input"
                  id="coupon_rate"
                  name="coupon_rate"
                  type="number"
                  step="0.01"
                  value={formData.coupon_rate}
                  onChange={handleInputChange}
                  placeholder="8.5"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="interest_payment_frequency">Interest Frequency</Label>
                <Select
                  data-testid="interest-frequency-select"
                  value={formData.interest_payment_frequency}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, interest_payment_frequency: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="semi-annual">Semi-Annual</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="primary_irr">Primary Buyer IRR (%)</Label>
                <Input
                  data-testid="primary-irr-input"
                  id="primary_irr"
                  name="primary_irr"
                  type="number"
                  step="0.01"
                  value={formData.primary_irr}
                  onChange={handleInputChange}
                  placeholder="9.0"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="secondary_irr">Secondary Buyer IRR (%)</Label>
                <Input
                  data-testid="secondary-irr-input"
                  id="secondary_irr"
                  name="secondary_irr"
                  type="number"
                  step="0.01"
                  value={formData.secondary_irr}
                  onChange={handleInputChange}
                  placeholder="8.5"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="total_units">Total Units Available</Label>
                <Input
                  data-testid="total-units-input"
                  id="total_units"
                  name="total_units"
                  type="number"
                  value={formData.total_units}
                  onChange={handleInputChange}
                  placeholder="1"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minimum_units">Minimum Units (per order)</Label>
                <Input
                  data-testid="minimum-units-input"
                  id="minimum_units"
                  name="minimum_units"
                  type="number"
                  value={formData.minimum_units}
                  onChange={handleInputChange}
                  placeholder="1"
                  required
                />
              </div>
            </div>
          </div>

          {/* Principal Payment Schedule */}
          <div className="metric-card rounded-md">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold">Principal Payment Schedule</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Total: <span className={`font-mono font-medium ${Math.abs(totalPrincipalPct - 100) < 0.01 ? 'text-success' : 'text-destructive'}`}>
                    {totalPrincipalPct.toFixed(2)}%
                  </span> (must equal 100%)
                </p>
              </div>
              <Button
                data-testid="add-principal-payment"
                type="button"
                variant="outline"
                size="sm"
                onClick={addPrincipalPayment}
                className="btn-scale"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Payment
              </Button>
            </div>
            <div className="space-y-3">
              {principalPayments.map((payment, index) => (
                <div key={index} className="flex gap-3 items-end">
                  <div className="flex-1 space-y-2">
                    <Label>Date</Label>
                    <Input
                      data-testid={`principal-date-${index}`}
                      type="date"
                      value={payment.date}
                      onChange={(e) => updatePrincipalPayment(index, 'date', e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <Label>Percentage (%)</Label>
                    <Input
                      data-testid={`principal-percentage-${index}`}
                      type="number"
                      step="0.01"
                      value={payment.percentage}
                      onChange={(e) => updatePrincipalPayment(index, 'percentage', e.target.value)}
                      placeholder="100"
                      required
                    />
                  </div>
                  <Button
                    data-testid={`remove-principal-${index}`}
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => removePrincipalPayment(index)}
                    disabled={principalPayments.length === 1}
                    className="btn-scale"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Interest Payment Schedule */}
          <div className="metric-card rounded-md">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold">Interest Payment Schedule</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Interest calculated on outstanding principal balance
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  data-testid="generate-interest-schedule"
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={generateInterestSchedule}
                  className="btn-scale"
                >
                  <Calculator className="h-4 w-4 mr-2" />
                  Auto Generate
                </Button>
                <Button
                  data-testid="add-interest-payment"
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addInterestPayment}
                  className="btn-scale"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Payment
                </Button>
              </div>
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {interestPayments.map((payment, index) => (
                <div key={index} className="flex gap-3 items-end">
                  <div className="flex-1 space-y-2">
                    <Label>Date</Label>
                    <Input
                      data-testid={`interest-date-${index}`}
                      type="date"
                      value={payment.date}
                      onChange={(e) => updateInterestPayment(index, 'date', e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <Label>Amount (₹)</Label>
                    <Input
                      data-testid={`interest-amount-${index}`}
                      type="number"
                      step="0.01"
                      value={payment.amount}
                      onChange={(e) => updateInterestPayment(index, 'amount', e.target.value)}
                      placeholder="21,250"
                      required
                    />
                  </div>
                  <Button
                    data-testid={`remove-interest-${index}`}
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => removeInterestPayment(index)}
                    disabled={interestPayments.length === 1}
                    className="btn-scale"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex gap-3 justify-end">
            <Button
              data-testid="cancel-create-bond"
              type="button"
              variant="outline"
              onClick={() => navigate("/")}
              disabled={submitting}
              className="btn-scale"
            >
              Cancel
            </Button>
            <Button
              data-testid="submit-create-bond"
              type="submit"
              disabled={submitting}
              className="btn-scale bg-accent text-white hover:bg-accent/90"
            >
              {submitting ? "Creating..." : "Create Bond"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}