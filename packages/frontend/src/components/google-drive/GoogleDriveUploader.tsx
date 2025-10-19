import React, { useState, useRef, useCallback } from 'react';
import { useGoogleDriveFiles } from '../../hooks/useGoogleDrive';
import {
  Upload,
  Cloud,
  File,
  Folder,
  X,
  CheckCircle,
  AlertCircle,
  Loader,
  ExternalLink
} from 'lucide-react';

interface GoogleDriveUploaderProps {
  organizationId: string;
  defaultFolderId?: string;
  onUploadComplete?: (fileId: string, fileName: string) => void;
  onError?: (error: string) => void;
  maxFileSize?: number; // bytes, default 500MB
}

interface UploadFile {
  id: string;
  file: File;
  progress: number;
  status: 'queued' | 'uploading' | 'complete' | 'error';
  error?: string;
  googleFileId?: string;
  webViewLink?: string;
}

export const GoogleDriveUploader: React.FC<GoogleDriveUploaderProps> = ({
  organizationId,
  defaultFolderId,
  onUploadComplete,
  onError,
  maxFileSize = 500 * 1024 * 1024 // 500MB default
}) => {
  const { uploadFile, uploading, error: hookError } = useGoogleDriveFiles(organizationId, defaultFolderId);

  const [uploadQueue, setUploadQueue] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState(defaultFolderId);
  const [recentUploads, setRecentUploads] = useState<UploadFile[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Format file size
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  // Get file icon based on type
  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const iconClass = "w-5 h-5";

    if (['pdf'].includes(ext || '')) {
      return <File className={`${iconClass} text-red-600`} />;
    }
    if (['doc', 'docx'].includes(ext || '')) {
      return <File className={`${iconClass} text-blue-600`} />;
    }
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext || '')) {
      return <File className={`${iconClass} text-purple-600`} />;
    }
    return <File className={`${iconClass} text-gray-600`} />;
  };

  // Validate file size
  const validateFileSize = (file: File): boolean => {
    if (file.size > maxFileSize) {
      onError?.(`File "${file.name}" exceeds maximum size of ${formatBytes(maxFileSize)}`);
      return false;
    }
    return true;
  };

  // Add files to upload queue
  const addFilesToQueue = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(validateFileSize);

    const newUploads: UploadFile[] = validFiles.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      progress: 0,
      status: 'queued'
    }));

    setUploadQueue(prev => [...prev, ...newUploads]);

    // Start uploading
    newUploads.forEach(upload => processUpload(upload));
  };

  // Process individual upload
  const processUpload = async (uploadItem: UploadFile) => {
    try {
      // Update status to uploading
      setUploadQueue(prev =>
        prev.map(item =>
          item.id === uploadItem.id
            ? { ...item, status: 'uploading' as const, progress: 10 }
            : item
        )
      );

      // Simulate progress (in real implementation, use XMLHttpRequest for progress tracking)
      const progressInterval = setInterval(() => {
        setUploadQueue(prev =>
          prev.map(item =>
            item.id === uploadItem.id && item.progress < 90
              ? { ...item, progress: item.progress + 10 }
              : item
          )
        );
      }, 200);

      // Upload file (you'll need to modify uploadFile to accept File object)
      // For now, we'll simulate the upload
      const result = await uploadFile(
        URL.createObjectURL(uploadItem.file), // Convert to path/URL
        uploadItem.file.name,
        currentFolderId
      );

      clearInterval(progressInterval);

      // Update to complete
      setUploadQueue(prev =>
        prev.map(item =>
          item.id === uploadItem.id
            ? {
                ...item,
                status: 'complete' as const,
                progress: 100,
                googleFileId: result.fileId,
                webViewLink: result.webViewLink
              }
            : item
        )
      );

      // Add to recent uploads
      setRecentUploads(prev => [
        {
          ...uploadItem,
          status: 'complete',
          progress: 100,
          googleFileId: result.fileId,
          webViewLink: result.webViewLink
        },
        ...prev.slice(0, 4) // Keep last 5
      ]);

      // Call completion callback
      onUploadComplete?.(result.fileId, uploadItem.file.name);

      // Remove from queue after 5 seconds
      setTimeout(() => {
        setUploadQueue(prev => prev.filter(item => item.id !== uploadItem.id));
      }, 5000);

    } catch (error: any) {
      setUploadQueue(prev =>
        prev.map(item =>
          item.id === uploadItem.id
            ? {
                ...item,
                status: 'error' as const,
                error: error.message || 'Upload failed'
              }
            : item
        )
      );

      onError?.(error.message || 'Upload failed');
    }
  };

  // Cancel upload
  const cancelUpload = (uploadId: string) => {
    setUploadQueue(prev => prev.filter(item => item.id !== uploadId));
  };

  // Retry upload
  const retryUpload = (uploadId: string) => {
    const upload = uploadQueue.find(item => item.id === uploadId);
    if (upload) {
      setUploadQueue(prev =>
        prev.map(item =>
          item.id === uploadId
            ? { ...item, status: 'queued' as const, error: undefined }
            : item
        )
      );
      processUpload(upload);
    }
  };

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === dropZoneRef.current) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const { files } = e.dataTransfer;
    if (files && files.length > 0) {
      addFilesToQueue(files);
    }
  }, []);

  // File input handler
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { files } = e.target;
    if (files && files.length > 0) {
      addFilesToQueue(files);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-blue-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Upload className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Upload to Google Drive</h3>
              <p className="text-sm text-gray-600">Drag files or click to select</p>
            </div>
          </div>

          {/* Folder Selector */}
          <div className="flex items-center gap-2 text-sm">
            <Folder className="w-4 h-4 text-gray-600" />
            <span className="text-gray-700">
              {currentFolderId ? 'Selected Folder' : 'Google Drive Root'}
            </span>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Drop Zone */}
        <div
          ref={dropZoneRef}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-lg p-8 transition-all cursor-pointer ${
            isDragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileInput}
            className="hidden"
          />

          <div className="flex flex-col items-center justify-center text-center">
            <Cloud className={`w-16 h-16 mb-4 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} />
            <p className="text-lg font-medium text-gray-900 mb-1">
              {isDragging ? 'Drop files here' : 'Drag files here or click to select'}
            </p>
            <p className="text-sm text-gray-500">
              Maximum file size: {formatBytes(maxFileSize)}
            </p>
          </div>
        </div>

        {/* Upload Queue */}
        {uploadQueue.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Upload Queue ({uploadQueue.length})
            </h4>

            <div className="space-y-2">
              {uploadQueue.map((upload) => (
                <div
                  key={upload.id}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
                >
                  {/* File Icon */}
                  <div className="flex-shrink-0">
                    {upload.status === 'complete' ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : upload.status === 'error' ? (
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    ) : upload.status === 'uploading' ? (
                      <Loader className="w-5 h-5 text-blue-600 animate-spin" />
                    ) : (
                      getFileIcon(upload.file.name)
                    )}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {upload.file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatBytes(upload.file.size)}
                    </p>

                    {/* Progress Bar */}
                    {upload.status === 'uploading' && (
                      <div className="mt-1">
                        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 transition-all duration-300"
                            style={{ width: `${upload.progress}%` }}
                          ></div>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{upload.progress}%</p>
                      </div>
                    )}

                    {/* Error Message */}
                    {upload.status === 'error' && upload.error && (
                      <p className="text-xs text-red-600 mt-1">{upload.error}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {upload.status === 'complete' && upload.webViewLink && (
                      <a
                        href={upload.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="View in Drive"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}

                    {upload.status === 'error' && (
                      <button
                        onClick={() => retryUpload(upload.id)}
                        className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      >
                        Retry
                      </button>
                    )}

                    {(upload.status === 'queued' || upload.status === 'uploading') && (
                      <button
                        onClick={() => cancelUpload(upload.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}

                    {upload.status === 'complete' && (
                      <button
                        onClick={() => cancelUpload(upload.id)}
                        className="p-1.5 text-gray-400 hover:bg-gray-100 rounded transition-colors"
                        title="Remove"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Uploads */}
        {recentUploads.length > 0 && (
          <div className="pt-4 border-t border-gray-200">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Recent Uploads</h4>
            <div className="space-y-2">
              {recentUploads.map((upload) => (
                <div
                  key={upload.id}
                  className="flex items-center justify-between p-2 hover:bg-gray-50 rounded transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {getFileIcon(upload.file.name)}
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900 truncate">{upload.file.name}</p>
                      <p className="text-xs text-gray-500">{formatBytes(upload.file.size)}</p>
                    </div>
                  </div>

                  {upload.webViewLink && (
                    <a
                      href={upload.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1"
                    >
                      View in Drive
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error Display */}
        {hookError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-800">{hookError}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
