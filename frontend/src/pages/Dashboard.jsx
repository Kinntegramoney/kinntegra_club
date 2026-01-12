import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { TrendingUp, DollarSign, Users, Package } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({
    totalBonds: 0,
    availableBonds: 0,
    fundedBonds: 0,
    closedBonds: 0,
    totalPartners: 0,
    activeUnits: 0
  });

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
    fetchStats();
  }, [navigate]);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem("token");
      const [bondsRes, partnersRes] = await Promise.all([
        axios.get(`${API}/bonds`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/partners`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      const bonds = bondsRes.data;
      const availableBonds = bonds.filter(b => (b.units_sold || 0) < (b.total_units || 1));
      const fundedBonds = bonds.filter(b => (b.units_sold || 0) >= (b.total_units || 1));
      
      setStats({
        totalBonds: bonds.length,
        availableBonds: availableBonds.length,
        fundedBonds: fundedBonds.length,
        closedBonds: 0, // TODO: Implement closed logic
        totalPartners: partnersRes.data.length,
        activeUnits: bonds.reduce((sum, b) => sum + ((b.total_units || 1) - (b.units_sold || 0)), 0)
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  if (!user) return null;

  const statCards = [
    { label: "Total Bonds", value: stats.totalBonds, icon: Package, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Available", value: stats.availableBonds, icon: TrendingUp, color: "text-green-600", bg: "bg-green-50" },
    { label: "Funded", value: stats.fundedBonds, icon: DollarSign, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Partners", value: stats.totalPartners, icon: Users, color: "text-purple-600", bg: "bg-purple-50" },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-8 py-6">
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Welcome back, {user.name}</p>
        </div>

        {/* Stats Grid */}
        <div className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {statCards.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">{stat.label}</p>
                      <p className="text-3xl font-bold text-gray-800 mt-2">{stat.value}</p>
                    </div>
                    <div className={`w-12 h-12 ${stat.bg} rounded-lg flex items-center justify-center`}>
                      <Icon className={`h-6 w-6 ${stat.color}`} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Actions */}
          <div className="mt-8 bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => navigate("/broker/admin/bonds")}
                className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-amber-500 hover:bg-amber-50 transition-colors text-center"
              >
                <Package className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p className="font-medium text-gray-700">Add New Bond</p>
              </button>
              <button
                onClick={() => navigate("/broker/admin/sub-brokers")}
                className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-colors text-center"
              >
                <Users className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p className="font-medium text-gray-700">Create Sub Broker</p>
              </button>
              <button
                onClick={() => navigate("/broker/opportunities")}
                className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition-colors text-center"
              >
                <TrendingUp className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p className="font-medium text-gray-700">View Opportunities</p>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}