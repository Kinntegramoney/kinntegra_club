import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut } from 'lucide-react';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function PdfViewer({ url, filename, className = "" }) {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(0.8);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setLoading(false);
    setError(null);
  };

  const onDocumentLoadError = (err) => {
    console.error('PDF load error:', err);
    setError('Failed to load PDF');
    setLoading(false);
  };

  const goToPrevPage = () => {
    setPageNumber(prev => Math.max(prev - 1, 1));
  };

  const goToNextPage = () => {
    setPageNumber(prev => Math.min(prev + 1, numPages || 1));
  };

  const zoomIn = () => {
    setScale(prev => Math.min(prev + 0.2, 2));
  };

  const zoomOut = () => {
    setScale(prev => Math.max(prev - 0.2, 0.4));
  };

  return (
    <div className={`relative bg-gray-800 rounded-t-lg overflow-hidden ${className}`}>
      {/* PDF Document */}
      <div className="h-64 overflow-auto flex items-center justify-center">
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto mb-2"></div>
                <p className="text-xs">Loading PDF...</p>
              </div>
            </div>
          }
          error={
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center p-4">
                <p className="text-xs mb-2">Unable to display PDF</p>
                <a 
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white text-xs rounded hover:bg-amber-600"
                >
                  <Download className="h-3 w-3" />
                  Download
                </a>
              </div>
            </div>
          }
        >
          <Page 
            pageNumber={pageNumber} 
            scale={scale}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            className="mx-auto"
          />
        </Document>
      </div>

      {/* Controls overlay - only show if PDF loaded successfully */}
      {numPages && !error && (
        <>
          {/* Page navigation */}
          <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex items-center gap-2 bg-black/70 rounded-full px-3 py-1.5">
            <button
              onClick={goToPrevPage}
              disabled={pageNumber <= 1}
              className="p-1 text-white hover:text-amber-400 disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-white text-xs min-w-[60px] text-center">
              {pageNumber} / {numPages}
            </span>
            <button
              onClick={goToNextPage}
              disabled={pageNumber >= numPages}
              className="p-1 text-white hover:text-amber-400 disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Zoom controls */}
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/70 rounded-full px-2 py-1">
            <button
              onClick={zoomOut}
              disabled={scale <= 0.4}
              className="p-1 text-white hover:text-amber-400 disabled:text-gray-500"
            >
              <ZoomOut className="h-3 w-3" />
            </button>
            <span className="text-white text-[10px] min-w-[35px] text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={zoomIn}
              disabled={scale >= 2}
              className="p-1 text-white hover:text-amber-400 disabled:text-gray-500"
            >
              <ZoomIn className="h-3 w-3" />
            </button>
          </div>
        </>
      )}

      {/* Download button */}
      <a 
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-2 right-2 bg-amber-500 text-white text-[10px] px-2.5 py-1.5 rounded-lg hover:bg-amber-600 transition-colors flex items-center gap-1 shadow-lg z-10"
      >
        <Download className="h-3 w-3" />
        Download
      </a>
    </div>
  );
}
