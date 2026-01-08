"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  FileText,
  Users,
  Clipboard,
  ArrowRight,
} from "lucide-react";
import { parseSearchQuery } from "@/lib/search-utils";

interface SearchResult {
  id: string;
  type: "report" | "client" | "inspection";
  title: string;
  description?: string;
  url: string;
  rank?: number;
  metadata?: Record<string, any>;
}

interface GlobalSearchProps {
  open?: boolean;
  onClose?: () => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({
  open = false,
  onClose,
}) => {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(open);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Listen for Cmd+K or Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        handleClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  const handleClose = () => {
    setIsOpen(false);
    setQuery("");
    setResults([]);
    setSelectedIndex(0);
    onClose?.();
  };

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(searchQuery)}&limit=12`
      );
      if (response.ok) {
        const data = await response.json();
        // Sort by rank and take top 12
        const sorted = [
          ...data.results.reports,
          ...data.results.clients,
          ...data.results.inspections,
        ]
          .sort((a, b) => (b.rank || 0) - (a.rank || 0))
          .slice(0, 12);
        setResults(sorted);
        setSelectedIndex(0);
      }
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    performSearch(value);
  };

  const handleNavigate = (result: SearchResult) => {
    router.push(result.url);
    handleClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < results.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      handleNavigate(results[selectedIndex]);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "report":
        return <FileText size={16} className="text-blue-500" />;
      case "client":
        return <Users size={16} className="text-green-500" />;
      case "inspection":
        return <Clipboard size={16} className="text-purple-500" />;
      default:
        return <Search size={16} className="text-gray-500" />;
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-start justify-center pt-16">
        <div className="w-full max-w-2xl mx-4 bg-white rounded-lg shadow-xl overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
            <Search size={20} className="text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleQueryChange}
              onKeyDown={handleKeyDown}
              placeholder="Search reports, clients, inspections... (2+ characters)"
              className="flex-1 outline-none text-base"
            />
            <button
              onClick={handleClose}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>
          </div>

          {/* Results */}
          {query.length >= 2 && (
            <div
              ref={resultsRef}
              className="max-h-96 overflow-y-auto divide-y divide-gray-200"
            >
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : results.length > 0 ? (
                results.map((result, index) => (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={() => handleNavigate(result)}
                    className={`w-full px-4 py-3 text-left transition-colors ${
                      index === selectedIndex
                        ? "bg-blue-50"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-1">{getIcon(result.type)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900">
                          {result.title}
                        </div>
                        {result.description && (
                          <div className="text-xs text-gray-600 mt-1 truncate">
                            {result.description}
                          </div>
                        )}
                      </div>
                      <ArrowRight
                        size={16}
                        className="text-gray-400 flex-shrink-0"
                      />
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-4 py-8 text-center text-gray-500 text-sm">
                  No results found for "{query}"
                </div>
              )}
            </div>
          )}

          {/* Help text */}
          {!query && (
            <div className="px-4 py-8 text-center text-gray-500 text-sm">
              <p>Enter a search query to get started</p>
            </div>
          )}

          {/* Footer */}
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
            <div>
              <span className="inline-block bg-gray-200 px-2 py-1 rounded mr-2">
                ↑↓
              </span>
              Navigate
              <span className="inline-block bg-gray-200 px-2 py-1 rounded mx-2">
                ↵
              </span>
              Select
              <span className="inline-block bg-gray-200 px-2 py-1 rounded mx-2">
                esc
              </span>
              Close
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default GlobalSearch;
