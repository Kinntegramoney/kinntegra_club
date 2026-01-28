import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * Log user activity when they visit a page section
 * @param {string} pageSection - The section/page being visited (e.g., 'holdings', 'opportunities')
 * @param {object} metadata - Optional additional context (bond_id, property_id, client_id)
 */
export const logUserActivity = async (pageSection, metadata = {}) => {
  try {
    const token = localStorage.getItem('token');
    if (!token) return; // Don't log if not authenticated
    
    await axios.post(
      `${API}/activity-logs`,
      {
        page_section: pageSection,
        bond_id: metadata.bond_id || null,
        property_id: metadata.property_id || null,
        client_id: metadata.client_id || null,
        metadata: metadata.extra || null
      },
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
  } catch (error) {
    // Silently fail - activity logging should not block user experience
    console.debug('Activity log failed:', error.message);
  }
};

export default logUserActivity;
