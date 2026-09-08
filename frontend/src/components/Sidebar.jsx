import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LayoutGrid, TrendingUp, Users, UserCheck, LogOut, ClipboardCheck, Menu, X, Wallet, FileBarChart, Upload, Download, Tag, User, CheckSquare, History, Settings, UserPlus, FileText, ChevronLeft, ChevronRight, Building2, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/contexts/PermissionsContext";
import NotificationBell from "@/components/NotificationBell";

export default function Sidebar({ user }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { hasPermission } = usePermissions();

  // Load collapsed state from localStorage
  useEffect(() => {
    const savedCollapsed = localStorage.getItem("sidebarCollapsed");
    if (savedCollapsed !== null) {
      setCollapsed(JSON.parse(savedCollapsed));
    }
  }, []);

  // Save collapsed state to localStorage
  const toggleCollapsed = () => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    localStorage.setItem("sidebarCollapsed", JSON.stringify(newCollapsed));
  };

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/");
  };

  const isActive = (path) => location.pathname === path;
  const isPartnersActive = 
    location.pathname.startsWith("/broker/admin/sub-brokers") || 
    location.pathname.startsWith("/broker/admin/re-brokers");

  const isOpportunitiesActive = location.pathname.startsWith("/broker/admin/bonds") || 
                                location.pathname.startsWith("/broker/admin/real-estate") ||
                                location.pathname === "/broker/opportunities" ||
                                location.pathname === "/sub-broker/opportunities";

  const isBroker = user?.role === "broker";
  const isSubBroker = user?.role === "sub_broker";

  // Analytics is always shown for broker and sub-broker
  const dashboardEnabled = true;

  // Menu items for Broker - Arranged as per user request
  const brokerMenuItems = [
    { path: "/broker/summary", label: "Dashboard", icon: LayoutGrid },
    { path: "/broker/opportunities", label: "Opportunities", icon: TrendingUp, active: isOpportunitiesActive },
    { path: "/broker/holdings", label: "Holdings", icon: Wallet },
    { path: "/broker/reinvestment", label: "Reinv Tag", icon: Tag },
    { path: "/broker/approvals", label: "Approve", icon: CheckSquare },
    { path: "/broker/logs", label: "Logs", icon: FileText },
    { path: "/analysis", label: "Analysis", icon: FileBarChart },
    { path: "/broker/data-gathering", label: "Data Gathering", icon: Database },
    { path: "/broker/dashboard", label: "Analytics", icon: LayoutGrid },
    { path: "/broker/admin/sub-brokers", label: "Partners", icon: Users, active: isPartnersActive },
    { path: "/broker/admin/clients", label: "Private Investors", icon: UserCheck },
    { path: "/broker/bulk-upload", label: "Upload", icon: Upload },
    { path: "/broker/downloads", label: "Downloads", icon: Download },
    { path: "/broker/settings", label: "Settings", icon: Settings },
  ];

  // Menu items for Sub-Broker (MFD/RIA) - Arranged as per user request
  const subBrokerMenuItems = [
    { path: "/sub-broker/summary", label: "Dashboard", icon: LayoutGrid },
    { path: "/sub-broker/dashboard", label: "Analytics", icon: LayoutGrid },
    { path: "/sub-broker/opportunities", label: "Opportunities", icon: TrendingUp, active: isOpportunitiesActive },
    { path: "/sub-broker/holdings", label: "Holdings", icon: Wallet },
    { path: "/sub-broker/reinvestment", label: "Reinv Tag", icon: Tag },
    { path: "/sub-broker/approvals", label: "Approve", icon: CheckSquare },
    { path: "/sub-broker/logs", label: "Logs", icon: FileText },
    { path: "/sub-broker/analysis", label: "Analysis", icon: FileBarChart },
    { path: "/sub-broker/data-gathering", label: "Data Gathering", icon: Database },
    { path: "/sub-broker/clients", label: "Private Investors", icon: UserCheck },
    { path: "/sub-broker/bulk-upload", label: "Upload", icon: Upload },
  ];

  // Select menu items based on role
  const menuItems = isBroker ? brokerMenuItems : isSubBroker ? subBrokerMenuItems : [];

  const SidebarContent = ({ isCollapsed = false }) => (
    <>
      {/* Logo */}
      <div className={`p-4 border-b border-gray-200 ${isCollapsed ? 'px-2' : ''}`}>
        <div className="flex items-center justify-between">
          <button 
            onClick={() => navigate(isBroker ? '/broker/profile' : isSubBroker ? '/sub-broker/profile' : '/')}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer"
            title="Go to Profile"
          >
            <div className="w-10 h-10 overflow-hidden flex-shrink-0">
              <img 
                src="/logo.svg" 
                alt="Kinntegraa" 
                className="w-full h-full object-contain"
                onError={(e) => {
                  e.target.parentElement.innerHTML = '<span class="text-white text-xl font-bold flex items-center justify-center w-full h-full bg-gradient-to-br from-orange-500 to-etihad-gold-600 rounded-full">K</span>';
                }}
              />
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <p className="font-semibold text-gray-800">Kinntegraa</p>
                <p className="text-xs text-gray-500 truncate">{user?.name}</p>
              </div>
            )}
          </button>
          {/* Notification Bell - only show when expanded */}
          {!isCollapsed && <NotificationBell user={user} />}
        </div>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 p-2 space-y-1 overflow-y-auto ${isCollapsed ? 'px-1' : 'px-3'}`}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const active = item.active !== undefined ? item.active : isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              title={isCollapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                active
                  ? 'bg-etihad-gold-50 text-etihad-gold-700'
                  : 'text-gray-700 hover:bg-gray-50'
              } ${isCollapsed ? 'justify-center px-2' : ''}`}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {!isCollapsed && <span className="font-medium text-sm">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Logout Button */}
      <div className={`p-3 border-t border-gray-200 ${isCollapsed ? 'px-1' : ''}`}>
        <Button
          variant="ghost"
          onClick={handleLogout}
          title={isCollapsed ? "Logout" : undefined}
          className={`w-full text-gray-600 hover:text-red-600 hover:bg-red-50 ${isCollapsed ? 'justify-center px-2' : 'justify-start'}`}
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {!isCollapsed && <span className="ml-3">Logout</span>}
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
          <SidebarContent isCollapsed={false} />
        </div>
      </aside>

      {/* Sidebar - Desktop */}
      <aside className={`hidden md:flex bg-white border-r border-gray-200 flex-col h-screen sticky top-0 transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-56'
      }`}>
        <SidebarContent isCollapsed={collapsed} />
        
        {/* Collapse Toggle Button */}
        <button
          onClick={toggleCollapsed}
          className="absolute -right-3 top-20 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50 transition-colors z-10"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronLeft className="h-4 w-4 text-gray-500" />
          )}
        </button>
      </aside>
    </>
  );
}
