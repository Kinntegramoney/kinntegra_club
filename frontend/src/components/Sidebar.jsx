import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LayoutGrid, TrendingUp, Users, UserCheck, LogOut, ClipboardCheck, Menu, X, Wallet, FileBarChart, Upload, Tag, User } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Sidebar({ user }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const isActive = (path) => location.pathname === path;
  const isOpportunitiesActive = location.pathname.startsWith("/broker/admin/bonds") || 
                                location.pathname.startsWith("/broker/admin/real-estate") ||
                                location.pathname === "/broker/opportunities" ||
                                location.pathname === "/sub-broker/opportunities";

  const isBroker = user?.role === "broker";
  const isSubBroker = user?.role === "sub_broker";

  // Menu items for Broker
  const brokerMenuItems = [
    { path: "/broker/dashboard", label: "Dashboard", icon: LayoutGrid },
    { path: "/broker/opportunities", label: "Opportunities", icon: TrendingUp, active: isOpportunitiesActive },
    { path: "/broker/trades", label: "Logs", icon: ClipboardCheck },
    { path: "/broker/holdings", label: "Holdings", icon: Wallet },
    { path: "/analysis", label: "Analysis", icon: FileBarChart },
    { path: "/broker/reinvestment", label: "Reinv Tag", icon: Tag },
    { path: "/broker/admin/sub-brokers", label: "Sub Broker", icon: Users },
    { path: "/broker/admin/clients", label: "Client", icon: UserCheck },
    { path: "/broker/bulk-upload", label: "Upload", icon: Upload },
  ];

  // Menu items for Sub-Broker (limited access)
  const subBrokerMenuItems = [
    { path: "/sub-broker/dashboard", label: "Dashboard", icon: LayoutGrid },
    { path: "/sub-broker/opportunities", label: "Opportunities", icon: TrendingUp, active: isOpportunitiesActive },
    { path: "/sub-broker/holdings", label: "Holdings", icon: Wallet },
    { path: "/sub-broker/clients", label: "Clients", icon: UserCheck },
    { path: "/sub-broker/reinvestment", label: "Reinv Tag", icon: Tag },
    { path: "/sub-broker/analysis", label: "Analysis", icon: FileBarChart },
    { path: "/sub-broker/profile", label: "Profile", icon: User },
  ];

  // Select menu items based on role
  const menuItems = isBroker ? brokerMenuItems : isSubBroker ? subBrokerMenuItems : [];

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="p-4 md:p-6 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
            <span className="text-white text-xl font-bold">K</span>
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-800">Kinntegraa</p>
            <p className="text-xs text-gray-500 truncate">{user?.name}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 md:p-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const active = item.active !== undefined ? item.active : isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-lg transition-colors ${
                active
                  ? 'bg-amber-50 text-amber-700'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              <span className="font-medium text-sm md:text-base">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Logout Button */}
      <div className="p-3 md:p-4 border-t border-gray-200">
        <Button
          variant="ghost"
          onClick={handleLogout}
          className="w-full justify-start text-gray-600 hover:text-red-600 hover:bg-red-50"
        >
          <LogOut className="h-5 w-5 mr-3" />
          Logout
        </Button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md"
      >
        {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar - Mobile */}
      <aside className={`md:hidden fixed inset-y-0 left-0 z-40 w-64 bg-white shadow-xl transform transition-transform duration-200 ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="h-full flex flex-col">
          <SidebarContent />
        </div>
      </aside>

      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-64 bg-white border-r border-gray-200 flex-col h-screen sticky top-0">
        <SidebarContent />
      </aside>
    </>
  );
}
