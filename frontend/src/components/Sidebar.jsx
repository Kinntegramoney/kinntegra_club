import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LayoutGrid, TrendingUp, Users, Settings, LogOut, ChevronRight, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Sidebar({ user }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [adminExpanded, setAdminExpanded] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const isActive = (path) => location.pathname === path;
  const isAdminActive = location.pathname.startsWith("/broker/admin");

  const menuItems = [
    { path: "/broker/dashboard", label: "Dashboard", icon: LayoutGrid },
    { path: "/broker/opportunities", label: "Opportunities", icon: TrendingUp },
    { path: "/broker/trades", label: "Trade Verification", icon: ClipboardCheck },
  ];

  const adminItems = [
    { path: "/broker/admin/bonds", label: "Add Bond" },
    { path: "/broker/admin/sub-brokers", label: "Create Sub Broker" },
    { path: "/broker/admin/clients", label: "Create Client" },
  ];

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-screen">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
            <span className="text-white text-xl font-bold">K</span>
          </div>
          <div>
            <p className="font-semibold text-gray-800">Kinntegraa</p>
            <p className="text-xs text-gray-500">{user?.name}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive(item.path)
                  ? 'bg-amber-50 text-amber-700'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}

        {/* Admin Menu */}
        <div>
          <button
            onClick={() => setAdminExpanded(!adminExpanded)}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors ${
              isAdminActive
                ? 'bg-amber-50 text-amber-700'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <Settings className="h-5 w-5" />
              <span className="font-medium">Admin</span>
            </div>
            <ChevronRight className={`h-4 w-4 transition-transform ${adminExpanded ? 'rotate-90' : ''}`} />
          </button>
          
          {adminExpanded && (
            <div className="ml-4 mt-1 space-y-1">
              {adminItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`w-full text-left px-4 py-2 rounded-lg text-sm transition-colors ${
                    isActive(item.path)
                      ? 'bg-amber-50 text-amber-700'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-gray-200">
        <Button
          onClick={handleLogout}
          variant="ghost"
          className="w-full justify-start text-gray-700 hover:bg-gray-50"
        >
          <LogOut className="h-5 w-5 mr-3" />
          Logout
        </Button>
      </div>
    </div>
  );
}