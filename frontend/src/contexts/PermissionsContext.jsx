import { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Create context
const PermissionsContext = createContext(null);

// Provider component
export function PermissionsProvider({ children }) {
  const [permissions, setPermissions] = useState({});
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const userData = localStorage.getItem("user");
      
      if (!token || !userData) {
        setLoading(false);
        return;
      }

      const user = JSON.parse(userData);
      setUserRole(user.role);

      const response = await axios.get(`${API}/role-permissions/user`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setPermissions(response.data.permissions);
    } catch (error) {
      console.error("Error fetching permissions:", error);
      // Set default permissions based on role
      const userData = localStorage.getItem("user");
      if (userData) {
        const user = JSON.parse(userData);
        setUserRole(user.role);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  // Check if user has permission for a specific feature and action
  const hasPermission = useCallback((feature, action) => {
    if (!permissions || !permissions[feature]) {
      // Default permissions if not loaded
      if (userRole === "broker") return true;
      if (userRole === "sub_broker") {
        // Sub-broker defaults
        const subBrokerDefaults = {
          opportunities_bonds: { view: true },
          opportunities_real_estate: { view: true },
          user_client: { view: true, edit: true },
          holdings: { view_tagged: true, view_self: true },
          logs: { view_tagged: true, view_self: true },
          tagged_tab: { view: true },
          analysis: { view: true }
        };
        return subBrokerDefaults[feature]?.[action] || false;
      }
      if (userRole === "client") {
        // Client defaults
        const clientDefaults = {
          opportunities_bonds: { view: true },
          opportunities_real_estate: { view: true },
          user_client: { edit: true, view: true },
          holdings: { view_self: true },
          logs: { view_self: true },
          tagged_tab: { view: true },
          reinvestment: { approve_reject: true }
        };
        return clientDefaults[feature]?.[action] || false;
      }
      return false;
    }
    return permissions[feature]?.[action] || false;
  }, [permissions, userRole]);

  // Check multiple permissions at once
  const hasAnyPermission = useCallback((feature, actions) => {
    return actions.some(action => hasPermission(feature, action));
  }, [hasPermission]);

  // Check if user can perform CRUD operations on a feature
  const canCreate = useCallback((feature) => hasPermission(feature, "create"), [hasPermission]);
  const canEdit = useCallback((feature) => hasPermission(feature, "edit"), [hasPermission]);
  const canView = useCallback((feature) => hasPermission(feature, "view"), [hasPermission]);
  const canDelete = useCallback((feature) => hasPermission(feature, "delete"), [hasPermission]);

  const value = {
    permissions,
    userRole,
    loading,
    hasPermission,
    hasAnyPermission,
    canCreate,
    canEdit,
    canView,
    canDelete,
    refreshPermissions: fetchPermissions
  };

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

// Custom hook to use permissions
export function usePermissions() {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error("usePermissions must be used within a PermissionsProvider");
  }
  return context;
}

// Higher-order component to protect components based on permissions
export function withPermission(WrappedComponent, feature, action) {
  return function PermissionWrapper(props) {
    const { hasPermission, loading } = usePermissions();
    
    if (loading) {
      return <div className="animate-pulse">Loading...</div>;
    }
    
    if (!hasPermission(feature, action)) {
      return null; // Or return a "No Permission" message
    }
    
    return <WrappedComponent {...props} />;
  };
}

// Utility component to conditionally render based on permission
export function PermissionGate({ feature, action, children, fallback = null }) {
  const { hasPermission, loading } = usePermissions();
  
  if (loading) {
    return null;
  }
  
  if (!hasPermission(feature, action)) {
    return fallback;
  }
  
  return children;
}

export default PermissionsContext;
