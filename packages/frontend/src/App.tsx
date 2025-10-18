import React, { useState } from 'react';
import { ApiKeyManager } from './components/ApiKeyManager';
import { ReportForm } from './components/ReportForm';
import { GeneratedReports } from './components/GeneratedReports';

function App() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleReportGenerated = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-600 text-white py-6 shadow-lg">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold">RestoreAssist</h1>
          <p className="text-blue-100 mt-1">AI-Powered Disaster Restoration Documentation</p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <ApiKeyManager />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <ReportForm onReportGenerated={handleReportGenerated} />
          </div>
          <div>
            <GeneratedReports key={refreshKey} />
          </div>
        </div>
      </main>

      <footer className="bg-gray-800 text-white py-4 mt-12">
        <div className="container mx-auto px-4 text-center">
          <p>&copy; 2025 RestoreAssist. Powered by Claude AI.</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
