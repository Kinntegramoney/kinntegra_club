import React, { useState, useEffect } from "react";
import axios from "axios";
import { Settings, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Currency Settings Modal Component - Global settings for currency projections
export default function CurrencySettingsModal({ onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [projections, setProjections] = useState([]);
  const [currencyPairs, setCurrencyPairs] = useState([{ from: "INR", to: "AED" }]);
  const currentYear = new Date().getFullYear();
  
  // Available currency options
  const currencies = ["INR", "USD", "EUR", "GBP", "SGD", "AUD", "CAD", "CHF", "JPY"];
  
  useEffect(() => {
    fetchProjections();
  }, []);
  
  const fetchProjections = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/settings/currency-projections`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.projections && response.data.projections.length > 0) {
        setProjections(response.data.projections);
        // Extract unique currency pairs
        const pairs = [...new Set(response.data.projections.map(p => p.currency))].map(c => ({ from: c, to: "AED" }));
        if (pairs.length > 0) setCurrencyPairs(pairs);
      } else {
        initializeDefaults();
      }
    } catch (error) {
      console.error("Error fetching projections:", error);
      initializeDefaults();
    }
  };
  
  const initializeDefaults = () => {
    const defaults = [];
    for (let i = 0; i < 6; i++) {
      defaults.push({ year: currentYear + i, currency: "INR", projected_rate: 22.5 });
    }
    setProjections(defaults);
  };
  
  const updateProjection = (index, field, value) => {
    const updated = [...projections];
    updated[index] = { ...updated[index], [field]: field === 'projected_rate' || field === 'year' ? parseFloat(value) || 0 : value };
    setProjections(updated);
  };
  
  const addYear = () => {
    const lastYear = projections.length > 0 ? projections[projections.length - 1].year : currentYear - 1;
    // Add for all currency pairs
    currencyPairs.forEach(pair => {
      setProjections(prev => [...prev, { year: lastYear + 1, currency: pair.from, projected_rate: 22.5 }]);
    });
  };
  
  const addCurrencyPair = () => {
    // Find a currency not yet added
    const usedCurrencies = currencyPairs.map(p => p.from);
    const availableCurrency = currencies.find(c => !usedCurrencies.includes(c)) || "USD";
    setCurrencyPairs([...currencyPairs, { from: availableCurrency, to: "AED" }]);
    
    // Add projections for this new currency for all existing years
    const years = [...new Set(projections.map(p => p.year))];
    const newProjections = years.map(year => ({ year, currency: availableCurrency, projected_rate: availableCurrency === "USD" ? 3.67 : availableCurrency === "EUR" ? 4.0 : 22.5 }));
    setProjections([...projections, ...newProjections]);
  };
  
  const removeCurrencyPair = (index) => {
    const pairToRemove = currencyPairs[index];
    setCurrencyPairs(currencyPairs.filter((_, i) => i !== index));
    setProjections(projections.filter(p => p.currency !== pairToRemove.from));
  };
  
  const removeYear = (index) => {
    setProjections(projections.filter((_, i) => i !== index));
  };
  
  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `${API}/settings/currency-projections`,
        { projections },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Currency projections saved!");
      onSuccess?.();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save projections");
    } finally {
      setLoading(false);
    }
  };
  
  // Group projections by currency for display
  const groupedProjections = currencyPairs.map(pair => ({
    currency: pair.from,
    projections: projections.filter(p => p.currency === pair.from).sort((a, b) => a.year - b.year)
  }));
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Settings className="h-5 w-5 text-cyan-600" />
              Currency Rate Projections
            </h2>
            <p className="text-sm text-gray-500">Set projected exchange rates for XIRR calculations and projections</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <form onSubmit={handleSave} className="p-4 space-y-4">
          <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
            <strong>Note:</strong> These projected rates are used globally for all XIRR calculations and real estate projections.
            Rate format: 1 AED = X [Currency]
          </div>
          
          {/* Currency Pairs with Add button */}
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-700">Currency Pairs</h3>
            <button
              type="button"
              onClick={addCurrencyPair}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-cyan-50 text-cyan-600 rounded-lg hover:bg-cyan-100"
            >
              <Plus className="h-4 w-4" /> Add Currency
            </button>
          </div>
          
          {/* Currency Pair Pills */}
          <div className="flex flex-wrap gap-2">
            {currencyPairs.map((pair, idx) => (
              <div key={idx} className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 rounded-full text-sm">
                <span className="font-medium">{pair.from}</span>
                <span className="text-gray-400">→</span>
                <span>AED</span>
                {currencyPairs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCurrencyPair(idx)}
                    className="ml-1 text-gray-400 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
          
          {/* Projections by Currency */}
          {groupedProjections.map((group, gIdx) => (
            <div key={gIdx} className="border rounded-lg p-3 space-y-3">
              <h4 className="font-medium text-gray-700 flex items-center gap-2">
                <span className="px-2 py-0.5 bg-cyan-100 text-cyan-700 rounded text-xs">{group.currency}</span>
                to AED Rates
              </h4>
              
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 px-2">
                <div className="col-span-4">Year</div>
                <div className="col-span-6">Rate (1 AED = X {group.currency})</div>
                <div className="col-span-2"></div>
              </div>
              
              {group.projections.map((proj, idx) => {
                const globalIdx = projections.findIndex(p => p.year === proj.year && p.currency === proj.currency);
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4">
                      <Input
                        type="number"
                        value={proj.year}
                        onChange={(e) => updateProjection(globalIdx, 'year', e.target.value)}
                        className="text-sm"
                      />
                    </div>
                    <div className="col-span-6">
                      <Input
                        type="number"
                        step="0.0001"
                        value={proj.projected_rate}
                        onChange={(e) => updateProjection(globalIdx, 'projected_rate', e.target.value)}
                        placeholder="e.g., 22.5"
                        className="text-sm"
                      />
                    </div>
                    <div className="col-span-2">
                      <button 
                        type="button" 
                        onClick={() => removeYear(globalIdx)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          
          <button
            type="button"
            onClick={addYear}
            className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-gray-400 hover:text-gray-600 flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" /> Add Year (All Currencies)
          </button>
          
          <div className="flex gap-3 pt-4 border-t">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-cyan-600 hover:bg-cyan-700">
              {loading ? "Saving..." : "Save Projections"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
