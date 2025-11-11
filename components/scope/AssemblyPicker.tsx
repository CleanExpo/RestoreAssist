"use client";
import { useEffect, useState } from "react";

interface Assembly {
  id: string;
  org_id: string;
  service_type: string;
  code: string;
  name: string;
  description: string;
  labour?: any[];
  equipment?: any[];
  materials?: any[];
  clauses?: any[];
  tags?: string[];
}

export default function AssemblyPicker({
  reportId,
  onPick
}: {
  reportId: string;
  onPick: (assembly: Assembly) => void;
}) {
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [service, setService] = useState<string>("");
  const [org, setOrg] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAssemblies();
  }, [service, org]);

  async function loadAssemblies() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (service) params.append('service', service);
      if (org) params.append('org', org);

      const response = await fetch(`/api/scope/assemblies?${params}`);
      const data = await response.json();
      setAssemblies(data.assemblies || []);
    } catch (error) {
      console.error('Failed to load assemblies:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-gray-300 rounded-lg p-4 bg-white shadow-sm space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Add Assembly</h2>

      <div className="flex gap-3">
        <input
          className="border border-gray-300 rounded px-3 py-2 flex-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Filter by service (e.g., Water, Mould, Fire, Bio)"
          value={service}
          onChange={(e) => setService(e.target.value)}
        />
        <input
          className="border border-gray-300 rounded px-3 py-2 w-32 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Org ID"
          value={org}
          onChange={(e) => setOrg(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading assemblies...</div>
      ) : assemblies.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No assemblies found. Try adjusting filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
          {assemblies.map((assembly) => (
            <div
              key={assembly.id}
              className="border border-gray-200 rounded-lg p-3 hover:border-blue-400 hover:shadow-md transition-all"
            >
              <div className="font-semibold text-gray-900">{assembly.name}</div>
              <div className="text-xs text-gray-600 mt-1">
                {assembly.code} • {assembly.service_type}
              </div>
              <p className="text-sm text-gray-700 mt-2 line-clamp-2">
                {assembly.description}
              </p>
              {assembly.tags && assembly.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {assembly.tags.slice(0, 3).map((tag, i) => (
                    <span
                      key={i}
                      className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <button
                className="mt-3 w-full bg-gray-900 hover:bg-gray-800 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
                onClick={() => onPick(assembly)}
              >
                Add to Scope
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
