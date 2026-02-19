import React, { useState, useEffect, useRef } from 'react';
import { Download, FileText, ExternalLink, AlertCircle, RefreshCw } from 'lucide-react';

/**
 * Bond PDF Viewer Component
 * Robust PDF viewer with multiple fallback strategies
 */
export default function BondPdfViewer({ url, filename, className = "" }) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const iframeRef = useRef(null);

  // Validate and clean the URL
  const cleanUrl = url ? url.trim() : '';
  
  useEffect(() => {
    setIsLoading(true);
    setError(null);
    
    // Validate URL before attempting to load
    if (!cleanUrl) {
      setError('No URL provided');
      setIsLoading(false);
      return;
    }

    // Pre-check if URL is accessible with timeout
    const checkUrl = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      try {
        // Try GET request directly (HEAD might not work on some servers)
        const response = await fetch(cleanUrl, { 
          method: 'GET',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          // Check response body for error message
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            try {
              const errorData = await response.json();
              if (errorData.detail) {
                setError(errorData.detail);
              } else {
                setError(`Server error: ${response.status}`);
              }
            } catch {
              setError(`Server error: ${response.status}`);
            }
          } else {
            const text = await response.text();
            if (text.includes('File not found') || text.includes('Not Found') || text.includes('not found')) {
              setError('File not found on server');
            } else {
              setError(`Server error: ${response.status}`);
            }
          }
          setIsLoading(false);
          return;
        }
        
        // Check if response is actually a PDF
        const contentType = response.headers.get('content-type');
        if (contentType && !contentType.includes('pdf') && contentType.includes('json')) {
          // Server returned JSON error instead of PDF
          try {
            const errorData = await response.json();
            setError(errorData.detail || 'Invalid file response');
          } catch {
            setError('Invalid file response');
          }
          setIsLoading(false);
          return;
        }
        
        // URL is accessible, let iframe load it
        setIsLoading(false);
      } catch (e) {
        clearTimeout(timeoutId);
        console.error('URL check failed:', e);
        if (e.name === 'AbortError') {
          setError('Request timed out');
        } else {
          setError('Failed to load presentation');
        }
        setIsLoading(false);
      }
    };

    checkUrl();
  }, [cleanUrl, retryCount]);

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
  };

  // Force download function
  const handleDownload = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      const response = await fetch(cleanUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename || 'presentation.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Download failed:', error);
      // Fallback to direct link in new tab
      window.open(cleanUrl, '_blank');
    }
  };

  // Open in new tab
  const handleOpenInTab = (e) => {
    e.preventDefault();
    window.open(cleanUrl, '_blank');
  };

  return (
    <div className={`relative bg-gray-900 rounded-t-lg overflow-hidden ${className}`}>
      {/* PDF Viewer Container */}
      <div className="h-64 w-full bg-gray-800">
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-500 border-t-transparent mx-auto mb-2"></div>
              <p className="text-xs text-gray-400">Loading presentation...</p>
            </div>
          </div>
        ) : error ? (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50">
            <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-6 text-center max-w-[90%]">
              <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <FileText className="h-7 w-7 text-amber-600" />
              </div>
              <h4 className="text-sm font-semibold text-gray-800 mb-1 truncate max-w-[200px] mx-auto">
                {filename || 'Bond Presentation'}
              </h4>
              <p className="text-xs text-red-500 mb-3 flex items-center justify-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {error}
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={handleRetry}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </button>
                <button
                  onClick={handleOpenInTab}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-200 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open
                </button>
                <button
                  onClick={handleDownload}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-600 transition-colors"
                >
                  <Download className="h-3 w-3" />
                  Download
                </button>
              </div>
            </div>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src={`${cleanUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`}
            title={filename || 'Presentation'}
            className="w-full h-full border-0"
            loading="eager"
            onError={() => setError('Failed to load PDF')}
          />
        )}
      </div>

      {/* Top Controls Bar - Always visible */}
      <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-10 pointer-events-none">
        {/* File info */}
        <div className="bg-black/70 backdrop-blur-sm rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 max-w-[55%] pointer-events-auto">
          <FileText className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
          <span className="text-[10px] text-white truncate font-medium">{filename || 'Presentation'}</span>
        </div>
        
        {/* Action buttons */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <button
            onClick={handleOpenInTab}
            className="bg-black/70 backdrop-blur-sm text-white text-[10px] p-1.5 rounded-lg hover:bg-black/90 transition-colors"
            title="Open in new tab"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleDownload}
            className="bg-amber-500 text-white text-[10px] px-3 py-1.5 rounded-lg hover:bg-amber-600 transition-colors flex items-center gap-1.5 shadow-lg font-medium"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
        </div>
      </div>
    </div>
  );
}
