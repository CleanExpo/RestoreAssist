import React from 'react';
import { Loader2 } from 'lucide-react';

export const LoadingFallback: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="text-center">
        <div className="relative inline-block">
          <div className="absolute inset-0 bg-blue-500 rounded-full blur-xl opacity-30 animate-pulse" />
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin relative" />
        </div>
        <p className="mt-4 text-gray-600 font-medium">Loading...</p>
      </div>
    </div>
  );
};

export const PageLoadingFallback: React.FC<{ pageName?: string }> = ({ pageName }) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Loading {pageName || 'Page'}...
          </h2>
          <p className="text-sm text-gray-500 mt-1">Please wait a moment</p>
        </div>
      </div>
    </div>
  );
};

export const FeatureLoadingFallback: React.FC = () => {
  return (
    <div className="min-h-[400px] flex items-center justify-center">
      <div className="flex items-center space-x-3">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
        <span className="text-gray-600 font-medium">Loading feature...</span>
      </div>
    </div>
  );
};