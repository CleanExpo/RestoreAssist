import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useGoogleDriveFiles } from '../../hooks/useGoogleDrive';
import {
  File,
  Folder,
  Grid3x3,
  List,
  Search,
  Download,
  Share2,
  Trash2,
  ChevronRight,
  Home,
  MoreVertical,
  CheckSquare,
  Square,
  X,
  Loader,
  AlertCircle,
  SortAsc,
  SortDesc,
  Calendar,
  HardDrive,
  User,
  ExternalLink
} from 'lucide-react';

interface GoogleDriveFileListProps {
  organizationId: string;
  defaultFolderId?: string;
  onFileSelect?: (fileId: string, fileName: string) => void;
  showBulkActions?: boolean;
  pageSize?: number;
}

type ViewMode = 'table' | 'grid';
type SortField = 'name' | 'modifiedTime' | 'size';
type SortOrder = 'asc' | 'desc';

interface BreadcrumbItem {
  id: string;
  name: string;
}

interface ShareDialogState {
  isOpen: boolean;
  fileId: string | null;
  fileName: string | null;
}

export const GoogleDriveFileList: React.FC<GoogleDriveFileListProps> = ({
  organizationId,
  defaultFolderId,
  onFileSelect,
  showBulkActions = true,
  pageSize = 50
}) => {
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(defaultFolderId);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [shareDialog, setShareDialog] = useState<ShareDialogState>({ isOpen: false, fileId: null, fileName: null });
  const [shareEmail, setShareEmail] = useState('');
  const [shareRole, setShareRole] = useState<'reader' | 'writer'>('reader');
  const [currentPage, setCurrentPage] = useState(1);

  const {
    files,
    loading,
    error,
    downloadFile,
    deleteFile,
    shareFile,
    navigateToFolder,
    refetch,
    hasMore,
    loadMore
  } = useGoogleDriveFiles(organizationId, currentFolderId);

  // Format file size
  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return 'N/A';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  // Format date
  const formatDate = (date: Date | string | null): string => {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // Get file icon
  const getFileIcon = (file: any) => {
    const iconClass = 'w-5 h-5';
    if (file.mimeType === 'application/vnd.google-apps.folder') {
      return <Folder className={`${iconClass} text-blue-500`} />;
    }
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (['pdf'].includes(ext || '')) {
      return <File className={`${iconClass} text-red-600`} />;
    }
    if (['doc', 'docx'].includes(ext || '')) {
      return <File className={`${iconClass} text-blue-600`} />;
    }
    if (['xls', 'xlsx'].includes(ext || '')) {
      return <File className={`${iconClass} text-green-600`} />;
    }
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext || '')) {
      return <File className={`${iconClass} text-purple-600`} />;
    }
    return <File className={`${iconClass} text-gray-600`} />;
  };

  // Filter and sort files
  const filteredAndSortedFiles = useMemo(() => {
    let result = [...files];

    // Filter by search query
    if (searchQuery) {
      result = result.filter(file =>
        file.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Sort
    result.sort((a, b) => {
      let compareResult = 0;

      switch (sortField) {
        case 'name':
          compareResult = a.name.localeCompare(b.name);
          break;
        case 'modifiedTime':
          compareResult = new Date(a.modifiedTime || 0).getTime() - new Date(b.modifiedTime || 0).getTime();
          break;
        case 'size':
          compareResult = (a.size || 0) - (b.size || 0);
          break;
      }

      return sortOrder === 'asc' ? compareResult : -compareResult;
    });

    return result;
  }, [files, searchQuery, sortField, sortOrder]);

  // Paginate files
  const paginatedFiles = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredAndSortedFiles.slice(startIndex, endIndex);
  }, [filteredAndSortedFiles, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredAndSortedFiles.length / pageSize);

  // Handle folder navigation
  const handleFolderClick = useCallback(async (folderId: string, folderName: string) => {
    setCurrentFolderId(folderId);
    setBreadcrumbs(prev => [...prev, { id: folderId, name: folderName }]);
    setCurrentPage(1);
    setSelectedFiles(new Set());
    await navigateToFolder(folderId);
  }, [navigateToFolder]);

  // Handle breadcrumb click
  const handleBreadcrumbClick = useCallback(async (index: number) => {
    if (index === -1) {
      // Home
      setCurrentFolderId(defaultFolderId);
      setBreadcrumbs([]);
    } else {
      const targetBreadcrumb = breadcrumbs[index];
      setCurrentFolderId(targetBreadcrumb.id);
      setBreadcrumbs(prev => prev.slice(0, index + 1));
    }
    setCurrentPage(1);
    setSelectedFiles(new Set());
    await refetch();
  }, [breadcrumbs, defaultFolderId, refetch]);

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Handle file selection
  const handleSelectFile = (fileId: string) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectedFiles.size === paginatedFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(paginatedFiles.map(f => f.id)));
    }
  };

  // Handle download
  const handleDownload = async (fileId: string, fileName: string) => {
    try {
      await downloadFile(fileId, fileName);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  // Handle share
  const handleShare = async () => {
    if (!shareDialog.fileId || !shareEmail) return;

    try {
      await shareFile(shareDialog.fileId, shareEmail, shareRole);
      setShareDialog({ isOpen: false, fileId: null, fileName: null });
      setShareEmail('');
      setShareRole('reader');
    } catch (err) {
      console.error('Share failed:', err);
    }
  };

  // Handle delete
  const handleDelete = async (fileId: string) => {
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
      await deleteFile(fileId);
      setSelectedFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(fileId);
        return newSet;
      });
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedFiles.size === 0) return;
    if (!confirm(`Delete ${selectedFiles.size} file(s)?`)) return;

    try {
      await Promise.all(Array.from(selectedFiles).map(id => deleteFile(id)));
      setSelectedFiles(new Set());
    } catch (err) {
      console.error('Bulk delete failed:', err);
    }
  };

  // Render sort icon
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />;
  };

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-blue-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Folder className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Files & Folders</h3>
              <p className="text-sm text-gray-600">{filteredAndSortedFiles.length} items</p>
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-2 bg-white rounded-lg p-1 shadow-sm">
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 rounded transition-colors ${
                viewMode === 'table' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'
              }`}
              title="Table View"
            >
              <List className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded transition-colors ${
                viewMode === 'grid' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'
              }`}
              title="Grid View"
            >
              <Grid3x3 className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Breadcrumbs */}
        <div className="flex items-center gap-2 text-sm mb-3">
          <button
            onClick={() => handleBreadcrumbClick(-1)}
            className="flex items-center gap-1 px-2 py-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
          >
            <Home className="w-4 h-4" />
            <span>Home</span>
          </button>
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={crumb.id}>
              <ChevronRight className="w-4 h-4 text-gray-400" />
              <button
                onClick={() => handleBreadcrumbClick(index)}
                className="px-2 py-1 text-gray-700 hover:bg-blue-50 rounded transition-colors"
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search files and folders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
          />
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {showBulkActions && selectedFiles.size > 0 && (
        <div className="px-6 py-3 bg-blue-50 border-b border-blue-200 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-900">
            {selectedFiles.size} file(s) selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkDelete}
              className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              Delete Selected
            </button>
            <button
              onClick={() => setSelectedFiles(new Set())}
              className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-6">
        {/* Loading State */}
        {loading && files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader className="w-8 h-8 text-blue-600 animate-spin mb-3" />
            <p className="text-gray-600">Loading files...</p>
          </div>
        ) : error ? (
          /* Error State */
          <div className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="w-12 h-12 text-red-600 mb-3" />
            <p className="text-red-800 font-medium mb-2">Failed to load files</p>
            <p className="text-sm text-gray-600 mb-4">{error}</p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : paginatedFiles.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-12">
            <Folder className="w-16 h-16 text-gray-300 mb-3" />
            <p className="text-gray-600 font-medium mb-1">No files found</p>
            <p className="text-sm text-gray-500">
              {searchQuery ? 'Try a different search query' : 'This folder is empty'}
            </p>
          </div>
        ) : viewMode === 'table' ? (
          /* Table View */
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200">
                <tr>
                  {showBulkActions && (
                    <th className="px-3 py-3 text-left w-12">
                      <button onClick={handleSelectAll} className="text-gray-600 hover:text-gray-900">
                        {selectedFiles.size === paginatedFiles.length ? (
                          <CheckSquare className="w-5 h-5" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                    </th>
                  )}
                  <th className="px-3 py-3 text-left w-12"></th>
                  <th
                    className="px-3 py-3 text-left cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-700">Name</span>
                      {renderSortIcon('name')}
                    </div>
                  </th>
                  <th
                    className="px-3 py-3 text-left cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => handleSort('modifiedTime')}
                  >
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-semibold text-gray-700">Modified</span>
                      {renderSortIcon('modifiedTime')}
                    </div>
                  </th>
                  <th
                    className="px-3 py-3 text-left cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => handleSort('size')}
                  >
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-semibold text-gray-700">Size</span>
                      {renderSortIcon('size')}
                    </div>
                  </th>
                  <th className="px-3 py-3 text-left">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-semibold text-gray-700">Owner</span>
                    </div>
                  </th>
                  <th className="px-3 py-3 text-right w-32">
                    <span className="text-sm font-semibold text-gray-700">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedFiles.map((file) => (
                  <tr key={file.id} className="hover:bg-gray-50 transition-colors">
                    {showBulkActions && (
                      <td className="px-3 py-3">
                        <button
                          onClick={() => handleSelectFile(file.id)}
                          className="text-gray-600 hover:text-gray-900"
                        >
                          {selectedFiles.has(file.id) ? (
                            <CheckSquare className="w-5 h-5 text-blue-600" />
                          ) : (
                            <Square className="w-5 h-5" />
                          )}
                        </button>
                      </td>
                    )}
                    <td className="px-3 py-3">{getFileIcon(file)}</td>
                    <td className="px-3 py-3">
                      {file.mimeType === 'application/vnd.google-apps.folder' ? (
                        <button
                          onClick={() => handleFolderClick(file.id, file.name)}
                          className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {file.name}
                        </button>
                      ) : (
                        <span className="text-sm font-medium text-gray-900">{file.name}</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-sm text-gray-600">{formatDate(file.modifiedTime)}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-sm text-gray-600">{formatBytes(file.size || 0)}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-sm text-gray-600">{file.owners?.[0]?.displayName || 'N/A'}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {file.webViewLink && (
                          <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            title="View in Drive"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                        {file.mimeType !== 'application/vnd.google-apps.folder' && (
                          <>
                            <button
                              onClick={() => handleDownload(file.id, file.name)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Download"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setShareDialog({ isOpen: true, fileId: file.id, fileName: file.name })}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                              title="Share"
                            >
                              <Share2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleDelete(file.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Grid View */
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {paginatedFiles.map((file) => (
              <div
                key={file.id}
                className="relative group border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-blue-300 transition-all"
              >
                {showBulkActions && (
                  <button
                    onClick={() => handleSelectFile(file.id)}
                    className="absolute top-2 left-2 z-10"
                  >
                    {selectedFiles.has(file.id) ? (
                      <CheckSquare className="w-5 h-5 text-blue-600" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </button>
                )}

                <div className="flex flex-col items-center text-center">
                  <div className="mb-3">
                    {file.mimeType === 'application/vnd.google-apps.folder' ? (
                      <Folder className="w-16 h-16 text-blue-500" />
                    ) : (
                      <File className="w-16 h-16 text-gray-500" />
                    )}
                  </div>

                  {file.mimeType === 'application/vnd.google-apps.folder' ? (
                    <button
                      onClick={() => handleFolderClick(file.id, file.name)}
                      className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline truncate w-full"
                    >
                      {file.name}
                    </button>
                  ) : (
                    <p className="text-sm font-medium text-gray-900 truncate w-full" title={file.name}>
                      {file.name}
                    </p>
                  )}

                  <p className="text-xs text-gray-500 mt-1">{formatBytes(file.size || 0)}</p>

                  {/* Actions (visible on hover) */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center gap-1 bg-white rounded-lg shadow-md p-1">
                      {file.mimeType !== 'application/vnd.google-apps.folder' && (
                        <>
                          <button
                            onClick={() => handleDownload(file.id, file.name)}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                            title="Download"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setShareDialog({ isOpen: true, fileId: file.id, fileName: file.name })}
                            className="p-1 text-green-600 hover:bg-green-50 rounded"
                            title="Share"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDelete(file.id)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredAndSortedFiles.length)} of {filteredAndSortedFiles.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Share Dialog Modal */}
      {shareDialog.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Share File</h3>
              <button
                onClick={() => {
                  setShareDialog({ isOpen: false, fileId: null, fileName: null });
                  setShareEmail('');
                }}
                className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Share <span className="font-medium text-gray-900">{shareDialog.fileName}</span> with:
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Permission Level
                </label>
                <select
                  value={shareRole}
                  onChange={(e) => setShareRole(e.target.value as 'reader' | 'writer')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="reader">Can view</option>
                  <option value="writer">Can edit</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  setShareDialog({ isOpen: false, fileId: null, fileName: null });
                  setShareEmail('');
                }}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleShare}
                disabled={!shareEmail}
                className="flex-1 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Share
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
