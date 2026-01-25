import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LayoutGrid, TrendingUp, LogOut, Menu, X, Wallet, FileBarChart, UserCheck, Tag, User, History, UserPlus, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SubBrokerSidebar({ user }) {
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

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + "/");

  const menuItems = [
    { path: "/sub-broker/dashboard", label: "Dashboard", icon: LayoutGrid },
    { path: "/sub-broker/opportunities", label: "Opportunities", icon: TrendingUp },
    { path: "/sub-broker/holdings", label: "Holdings", icon: Wallet },
    { path: "/sub-broker/clients", label: "Clients", icon: UserCheck },
    { path: "/sub-broker/leads", label: "Lead Mgmt", icon: UserPlus },
    { path: "/sub-broker/reinvestment", label: "Reinv Tag", icon: Tag },
    { path: "/sub-broker/logs", label: "Logs", icon: FileText },
    { path: "/sub-broker/analysis", label: "Analysis", icon: FileBarChart },
    { path: "/sub-broker/profile", label: "Profile", icon: User },
  ];

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
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-lg transition-colors ${
                isActive(item.path)
                  ? 'bg-etihad-gold-50 text-etihad-gold-700'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
              data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              <span className="font-medium text-sm md:text-base">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-3 md:p-4 border-t border-gray-200">
        <Button
          onClick={handleLogout}
          variant="ghost"
          className="w-full justify-start text-gray-700 hover:bg-gray-50"
          data-testid="logout-btn"
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
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-40 p-2 bg-white rounded-lg shadow-md border border-gray-200"
        data-testid="mobile-menu-btn"
      >
        <Menu className="h-5 w-5 text-gray-700" />
      </button>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <div className={`md:hidden fixed inset-y-0 left-0 w-64 bg-white z-50 transform transition-transform duration-300 ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 p-1 text-gray-500 hover:text-gray-700"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex flex-col h-full">
          <SidebarContent />
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-64 bg-white border-r border-gray-200 flex-col h-screen">
        <SidebarContent />
      </div>
    </>
  );
}
