"use client";

import React, { useState, useRef } from "react";
import { Search, X } from "lucide-react";

interface SearchBarProps {
  placeholder?: string;
  onSearch: (query: string) => void;
  onClear?: () => void;
  resultCount?: number;
  loading?: boolean;
  minChars?: number;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  placeholder = "Search reports, clients, or inspections...",
  onSearch,
  onClear,
  resultCount,
  loading = false,
  minChars = 2,
}) => {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  // Debounce the search — a persistent ref-based timer handle survives prop-identity
  // churn (onSearch/onClear/minChars re-created on parent re-render), unlike a
  // useCallback(debounce(...)) whose discarded closure leaks its pending timer.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value.length >= minChars) {
        onSearch(value);
      } else if (value.length === 0) {
        onClear?.();
      }
    }, 300);
  };

  const handleClear = () => {
    setQuery("");
    onClear?.();
  };

  return (
    <div className="w-full">
      <div className="relative">
        <div
          className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-all ${
            isFocused
              ? "border-blue-500 bg-white shadow-sm ring-1 ring-blue-200"
              : "border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300"
          }`}
        >
          <Search
            size={18}
            className={`text-slate-400 transition-colors ${
              isFocused ? "text-blue-500" : ""
            }`}
          />
          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            className="flex-1 bg-transparent outline-none text-sm text-slate-900 placeholder-slate-500"
          />
          {query && (
            <button
              onClick={handleClear}
              className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
          {loading && (
            <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
          )}
        </div>
      </div>

      {/* Result count indicator */}
      {query.length >= minChars && resultCount !== undefined && !loading && (
        <div className="mt-2 text-xs text-slate-600">
          {resultCount === 0
            ? "No results found"
            : `${resultCount} result${resultCount !== 1 ? "s" : ""} found`}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
