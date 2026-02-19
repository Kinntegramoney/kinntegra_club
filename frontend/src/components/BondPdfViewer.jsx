import React, { useState, useEffect } from 'react';
import { Download, FileText, ExternalLink, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';

/**
 * Bond PDF Viewer Component
 * Uses native browser PDF rendering with multiple fallback options
 */
export default function BondPdfViewer({ url, filename, className = "" }) {
  const [viewMode, setViewMode] = useState('embed'); // 'embed', 'object', 'fallback'
  const [loadError, setLoadError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Reset state when URL changes
  useEffect(() => {
    setViewMode('embed');
    setLoadError(false);
    setIsLoading(true);
  }, [url]);

  const handleEmbedError = () => {
    console.log('Embed failed, trying object tag');
    setViewMode('object');
  };

  const handleObjectError = () => {
    console.log('Object failed, showing fallback');
    setViewMode('fallback');
    setLoadError(true);
  };

  const handleLoad = () => {
    setIsLoading(false);
  };

  // Force download function
  const handleDownload = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      const response = await fetch(url);
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
      // Fallback to direct link
      window.open(url, '_blank');
    }
  };

  return (
    <div className={`relative bg-gray-900 rounded-t-lg overflow-hidden ${className}`}>
      {/* Loading indicator */}
      {isLoading && viewMode !== 'fallback' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-500 border-t-transparent mx-auto mb-2"></div>
            <p className="text-xs text-gray-400">Loading presentation...</p>
          </div>
        </div>
      )}

      {/* PDF Viewer Container */}
      <div className="h-64 w-full">
        {viewMode === 'embed' && (
          <embed
            src={`${url}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`}
            type="application/pdf"
            className="w-full h-full"
            onLoad={handleLoad}
            onError={handleEmbedError}
          />
        )}
        
        {viewMode === 'object' && (
          <object
            data={`${url}#toolbar=0&navpanes=0&scrollbar=1`}
            type="application/pdf"
            className="w-full h-full"
            onLoad={handleLoad}
            onError={handleObjectError}
          >
            {/* Fallback content inside object */}
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50">
              <FallbackCard url={url} filename={filename} onDownload={handleDownload} />
            </div>
          </object>
        )}
        
        {viewMode === 'fallback' && (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50">
            <FallbackCard url={url} filename={filename} onDownload={handleDownload} />
          </div>
        )}
      </div>

      {/* Top Controls Bar */}
      <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-10">
        {/* File info */}
        <div className="bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1 flex items-center gap-1.5 max-w-[60%]">
          <FileText className="h-3 w-3 text-amber-400 flex-shrink-0" />
          <span className="text-[10px] text-white truncate">{filename || 'Presentation'}</span>
        </div>
        
        {/* Action buttons */}
        <div className="flex items-center gap-1">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-1.5 rounded-lg hover:bg-black/80 transition-colors flex items-center gap-1"
            title="Open in new tab"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
          <button
            onClick={handleDownload}
            className="bg-amber-500 text-white text-[10px] px-2.5 py-1.5 rounded-lg hover:bg-amber-600 transition-colors flex items-center gap-1 shadow-lg"
          >
            <Download className="h-3 w-3" />
            Download
          </button>
        </div>
      </div>

      {/* Error indicator */}
      {loadError && (
        <div className="absolute bottom-2 left-2 bg-red-500/80 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Preview unavailable
        </div>
      )}
    </div>
  );
}

// Fallback card component when PDF can't be displayed
function FallbackCard({ url, filename, onDownload }) {
  return (
    <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-6 text-center max-w-[85%]">
      <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <FileText className="h-8 w-8 text-amber-600" />
      </div>
      <h4 className="text-sm font-semibold text-gray-800 mb-1">
        {filename || 'Bond Presentation'}
      </h4>
      <p className="text-xs text-gray-500 mb-4">
        Click below to view or download the presentation
      </p>
      <div className="flex items-center justify-center gap-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open
        </a>
        <button
          onClick={onDownload}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-600 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </button>
      </div>
    </div>
  );
}
