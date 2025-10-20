import React, { useState, useEffect } from 'react';

const API_KEY_STORAGE = 'anthropic_api_key';

export function ApiKeyManager() {
  const [apiKey, setApiKey] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(API_KEY_STORAGE);
    if (stored) {
      setApiKey(stored);
    }
  }, []);

  const handleSave = () => {
    if (apiKey.trim()) {
      localStorage.setItem(API_KEY_STORAGE, apiKey.trim());
      setIsEditing(false);
      alert('API Key saved successfully!');
    }
  };

  const handleClear = () => {
    if (confirm('Are you sure you want to clear the API key?')) {
      localStorage.removeItem(API_KEY_STORAGE);
      setApiKey('');
      setIsEditing(true);
    }
  };

  const maskedKey = apiKey ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : 'Not set';

  return (
    <div className="bg-card text-card-foreground p-4 rounded-lg shadow-md mb-6 border border-border">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold">Anthropic API Key</h3>
        {apiKey && !isEditing && (
          <div className="flex gap-2">
            <button
              onClick={() => setIsEditing(true)}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              Edit
            </button>
            <button
              onClick={handleClear}
              className="text-red-600 hover:text-red-800 text-sm"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {!apiKey || isEditing ? (
        <div className="space-y-3">
          <div>
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-api03-..."
              className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="showKey"
              checked={showKey}
              onChange={(e) => setShowKey(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="showKey" className="text-sm text-muted-foreground">
              Show API key
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!apiKey.trim()}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Save Key
            </button>
            {isEditing && apiKey && (
              <button
                onClick={() => {
                  setApiKey(localStorage.getItem(API_KEY_STORAGE) || '');
                  setIsEditing(false);
                }}
                className="bg-secondary text-secondary-foreground px-4 py-2 rounded-md hover:bg-secondary/80"
              >
                Cancel
              </button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Get your API key from{' '}
            <a
              href="https://console.anthropic.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              console.anthropic.com
            </a>
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground font-mono">{maskedKey}</span>
          <span className="text-green-600 dark:text-green-400 text-sm">✓ Configured</span>
        </div>
      )}
    </div>
  );
}

export function getStoredApiKey(): string | null {
  return localStorage.getItem(API_KEY_STORAGE);
}
