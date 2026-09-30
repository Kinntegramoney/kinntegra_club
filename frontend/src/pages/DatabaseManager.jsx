import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { 
  Database, 
  Trash2, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Search,
  Filter,
  Shield,
  Archive,
  Layers,
  HelpCircle,
  FileText
} from 'lucide-react';
import { Button } from '../components/ui/button';
import Sidebar from '../components/Sidebar';

const API = process.env.REACT_APP_BACKEND_URL;

export default function DatabaseManager() {
  const [user, setUser] = useState(null);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total_collections: 0,
    total_records: 0,
    categories: {}
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [deleteModal, setDeleteModal] = useState({ open: false, collection: null });
  const [cleanupModal, setCleanupModal] = useState(false);
  const [secretKey, setSecretKey] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  const fetchCollections = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/admin/database/collections`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch collections');
      }
      
      const data = await response.json();
      setCollections(data.collections || []);
      setStats({
        total_collections: data.total_collections,
        total_records: data.total_records,
        categories: data.categories || {}
      });
    } catch (error) {
      console.error('Error fetching collections:', error);
      toast.error('Failed to load database collections');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  const handleDeleteCollection = async () => {
    if (!deleteModal.collection || !secretKey) {
      toast.error('Please enter the secret key');
      return;
    }

    setDeleting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API}/api/admin/database/collections/${deleteModal.collection.name}?secret_key=${encodeURIComponent(secretKey)}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to delete collection');
      }

      const result = await response.json();
      toast.success(result.message);
      setDeleteModal({ open: false, collection: null });
      setSecretKey('');
      fetchCollections();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleCleanupDeprecated = async () => {
    if (!secretKey) {
      toast.error('Please enter the secret key');
      return;
    }

    setDeleting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API}/api/admin/database/cleanup-deprecated?secret_key=${encodeURIComponent(secretKey)}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to cleanup deprecated collections');
      }

      const result = await response.json();
      toast.success(result.message);
      setCleanupModal(false);
      setSecretKey('');
      fetchCollections();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setDeleting(false);
    }
  };

  const filteredCollections = collections.filter(col => {
    const matchesSearch = col.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (col.description && col.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = filterCategory === 'all' || col.status === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'deprecated':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircle className="w-3 h-3 mr-1" />
            Deprecated
          </span>
        );
      case 'protected':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            <Shield className="w-3 h-3 mr-1" />
            Protected
          </span>
        );
      case 'master':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
            <Layers className="w-3 h-3 mr-1" />
            Master
          </span>
        );
      case 'active':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            Active
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            <HelpCircle className="w-3 h-3 mr-1" />
            Unknown
          </span>
        );
    }
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat('en-IN').format(num);
  };

  const deprecatedCount = collections.filter(c => c.status === 'deprecated').length;
  const deprecatedRecords = collections.filter(c => c.status === 'deprecated').reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      <div className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <Database className="h-6 w-6 text-indigo-700" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-800">Database Manager</h1>
                  <p className="text-gray-600">View, manage and cleanup database collections</p>
                </div>
              </div>
              <Button
                onClick={fetchCollections}
                disabled={loading}
                variant="outline"
                className="flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl p-5 border border-gray-200 hover:shadow-lg transition-all">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 bg-indigo-100 rounded-lg">
                  <Database className="h-5 w-5 text-indigo-700" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-indigo-700">Total Collections</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total_collections}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl p-5 border border-gray-200 hover:shadow-lg transition-all">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 bg-green-100 rounded-lg">
                  <Layers className="h-5 w-5 text-green-700" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-green-700">Total Records</p>
                  <p className="text-2xl font-bold text-gray-900">{formatNumber(stats.total_records)}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl p-5 border border-gray-200 hover:shadow-lg transition-all">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 bg-emerald-100 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-emerald-700" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-emerald-700">Active Collections</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.categories?.active || 0}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl p-5 border border-gray-200 hover:shadow-lg transition-all">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 bg-red-100 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-red-700" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-red-700">Deprecated</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.categories?.deprecated || 0}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Deprecated Warning Banner */}
          {deprecatedCount > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                  <div>
                    <p className="font-medium text-red-800">
                      {deprecatedCount} deprecated collection(s) found
                    </p>
                    <p className="text-sm text-red-600">
                      {formatNumber(deprecatedRecords)} records can be safely removed to clean up the database
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => setCleanupModal(true)}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Cleanup All Deprecated
                </Button>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="bg-white rounded-xl p-4 border border-gray-200 mb-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search collections..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-500" />
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="all">All Categories</option>
                  <option value="active">Active</option>
                  <option value="deprecated">Deprecated</option>
                  <option value="master">Master Data</option>
                  <option value="protected">Protected</option>
                </select>
              </div>
            </div>
          </div>

          {/* Collections Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Collection Name
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Records
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {loading ? (
                    <tr>
                      <td colSpan="5" className="px-6 py-12 text-center">
                        <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
                        <p className="text-gray-500">Loading collections...</p>
                      </td>
                    </tr>
                  ) : filteredCollections.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-6 py-12 text-center">
                        <Database className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                        <p className="text-gray-500">No collections found</p>
                      </td>
                    </tr>
                  ) : (
                    filteredCollections.map((collection) => (
                      <tr 
                        key={collection.name}
                        className={`hover:bg-gray-50 ${collection.status === 'deprecated' ? 'bg-red-50/50' : ''}`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Database className={`w-4 h-4 ${collection.status === 'deprecated' ? 'text-red-400' : 'text-gray-400'}`} />
                            <span className={`font-mono text-sm ${collection.status === 'deprecated' ? 'text-red-700' : 'text-gray-900'}`}>
                              {collection.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(collection.status)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`font-medium ${collection.count > 10000 ? 'text-orange-600' : 'text-gray-900'}`}>
                            {formatNumber(collection.count)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-600">
                            {collection.description || '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {collection.can_delete ? (
                            <button
                              onClick={() => setDeleteModal({ open: true, collection })}
                              className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                              title="Delete collection"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">Protected</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Info Section */}
          <div className="mt-8 bg-gray-50 rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
              <FileText className="h-5 w-5 text-gray-600" />
              Collection Status Guide
            </h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• <span className="text-green-600 font-medium">Active</span> — Core collections currently in use</li>
              <li>• <span className="text-red-600 font-medium">Deprecated</span> — Old/unused collections that can be safely removed</li>
              <li>• <span className="text-purple-600 font-medium">Master</span> — Reference data (Gender, Country, etc.) - cannot be deleted</li>
              <li>• <span className="text-blue-600 font-medium">Protected</span> — Critical collections (users) - cannot be deleted</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Delete Modal */}
      {deleteModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Delete Collection</h3>
                <p className="text-sm text-gray-500">This action cannot be undone</p>
              </div>
            </div>
            
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-800">
                You are about to delete <strong className="font-mono">{deleteModal.collection?.name}</strong> with{' '}
                <strong>{formatNumber(deleteModal.collection?.count || 0)}</strong> records.
              </p>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Enter Secret Key to confirm
              </label>
              <input
                type="password"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder="KINNTEGRAA_RESET_2026"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>
            
            <div className="flex gap-3">
              <Button
                onClick={() => {
                  setDeleteModal({ open: false, collection: null });
                  setSecretKey('');
                }}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDeleteCollection}
                disabled={deleting || !secretKey}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              >
                {deleting ? (
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Cleanup Deprecated Modal */}
      {cleanupModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <Archive className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Cleanup Deprecated Collections</h3>
                <p className="text-sm text-gray-500">Remove all deprecated collections at once</p>
              </div>
            </div>
            
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-800 mb-2">
                The following collections will be deleted:
              </p>
              <ul className="text-sm text-red-700 space-y-1">
                {collections.filter(c => c.status === 'deprecated').map(c => (
                  <li key={c.name} className="flex items-center gap-2">
                    <XCircle className="w-3 h-3" />
                    <span className="font-mono">{c.name}</span>
                    <span className="text-red-500">({formatNumber(c.count)} records)</span>
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Enter Secret Key to confirm
              </label>
              <input
                type="password"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder="KINNTEGRAA_RESET_2026"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>
            
            <div className="flex gap-3">
              <Button
                onClick={() => {
                  setCleanupModal(false);
                  setSecretKey('');
                }}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCleanupDeprecated}
                disabled={deleting || !secretKey}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              >
                {deleting ? (
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                Cleanup All
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
