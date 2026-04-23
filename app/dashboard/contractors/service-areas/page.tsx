"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { MapPin, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ServiceArea {
  id: string;
  postcode: string;
  suburb: string | null;
  state: string;
  radius: number | null;
  isActive: boolean;
  priority: number;
}

const AU_STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"];

const defaultForm = {
  postcode: "",
  suburb: "",
  state: "",
  radius: "",
  priority: "0",
};

export default function ServiceAreasPage() {
  const { status } = useSession();
  const router = useRouter();
  const confirmDialog = useConfirmDialog();

  const [serviceAreas, setServiceAreas] = useState<ServiceArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileNotFound, setProfileNotFound] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(defaultForm);

  // Collapsible state per state group
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      loadServiceAreas();
    }
  }, [status]);

  function loadServiceAreas() {
    setLoading(true);
    fetch("/api/contractors/service-areas")
      .then((r) => r.json())
      .then((data) => {
        if (data.error === "Contractor profile not found") {
          setProfileNotFound(true);
        } else {
          setServiceAreas(data.serviceAreas || []);
        }
      })
      .catch(() => toast.error("Failed to load service areas"))
      .finally(() => setLoading(false));
  }

  // Summary stats
  const totalAreas = serviceAreas.length;
  const activeAreas = serviceAreas.filter((a) => a.isActive).length;
  const statesCovered =
    [...new Set(serviceAreas.map((a) => a.state))].sort().join(", ") || "—";

  // Group by state
  const grouped = serviceAreas.reduce(
    (acc, area) => {
      if (!acc[area.state]) acc[area.state] = [];
      acc[area.state].push(area);
      return acc;
    },
    {} as Record<string, ServiceArea[]>,
  );
  const states = Object.keys(grouped).sort();

  function toggleCollapse(state: string) {
    setCollapsed((prev) => ({ ...prev, [state]: !prev[state] }));
  }

  async function handleToggleActive(area: ServiceArea) {
    // Optimistic update
    setServiceAreas((prev) =>
      prev.map((a) => (a.id === area.id ? { ...a, isActive: !a.isActive } : a)),
    );
    try {
      const res = await fetch(`/api/contractors/service-areas/${area.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !area.isActive }),
      });
      if (!res.ok) {
        // Revert on failure
        setServiceAreas((prev) =>
          prev.map((a) =>
            a.id === area.id ? { ...a, isActive: area.isActive } : a,
          ),
        );
        toast.error("Failed to update service area");
      }
    } catch {
      setServiceAreas((prev) =>
        prev.map((a) =>
          a.id === area.id ? { ...a, isActive: area.isActive } : a,
        ),
      );
      toast.error("Failed to update service area");
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirmDialog.ask({
      title: "Delete service area?",
      description: "This cannot be undone.",
      destructive: true,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    const previous = serviceAreas;
    setServiceAreas((prev) => prev.filter((a) => a.id !== id));
    try {
      const res = await fetch(`/api/contractors/service-areas/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setServiceAreas(previous);
        toast.error("Failed to delete service area");
      } else {
        toast.success("Service area removed");
      }
    } catch {
      setServiceAreas(previous);
      toast.error("Failed to delete service area");
    }
  }

  async function handleAdd() {
    if (!form.postcode || !form.state) {
      toast.error("Postcode and state are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/contractors/service-areas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postcode: form.postcode,
          suburb: form.suburb || undefined,
          state: form.state,
          radius: form.radius ? parseInt(form.radius) : undefined,
          priority: form.priority ? parseInt(form.priority) : 0,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        toast.error("This postcode is already added");
        return;
      }
      if (!res.ok) {
        toast.error(data.error || "Failed to add service area");
        return;
      }
      setServiceAreas((prev) => [...prev, data.serviceArea]);
      setDialogOpen(false);
      setForm(defaultForm);
      toast.success("Service area added");
    } catch {
      toast.error("Failed to add service area");
    } finally {
      setSubmitting(false);
    }
  }

  function openDialog() {
    setForm(defaultForm);
    setDialogOpen(true);
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // Profile not found
  if (profileNotFound) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <MapPin className="h-12 w-12 text-slate-500 mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">
            Profile Not Set Up
          </h2>
          <p className="text-slate-400 max-w-sm">
            Complete your contractor profile first to manage service areas.
          </p>
          <Button
            className="mt-6"
            onClick={() => router.push("/dashboard/contractors/profile")}
          >
            Go to Profile
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <confirmDialog.Mount />
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Service Areas</h1>
          <p className="text-slate-400 mt-1">
            Postcodes and suburbs you cover for restoration work
          </p>
        </div>
        <Button onClick={openDialog} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Service Area
        </Button>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-white">{totalAreas}</div>
          <div className="text-sm text-slate-400 mt-1">Total Areas</div>
        </div>
        <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-cyan-400">{activeAreas}</div>
          <div className="text-sm text-slate-400 mt-1">Active Areas</div>
        </div>
        <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 text-center">
          <div className="text-lg font-semibold text-white truncate">
            {statesCovered}
          </div>
          <div className="text-sm text-slate-400 mt-1">States Covered</div>
        </div>
      </div>

      {/* Empty state */}
      {serviceAreas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <MapPin className="h-12 w-12 text-slate-500 mb-4" />
          <p className="text-slate-400 max-w-sm">
            No service areas yet. Add your first postcode to start appearing in
            contractor searches.
          </p>
          <Button onClick={openDialog} className="mt-6 flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add First Service Area
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {states.map((state) => {
            const areas = grouped[state];
            const isCollapsed = collapsed[state];
            return (
              <div
                key={state}
                className="bg-slate-800/30 border border-slate-700 rounded-lg overflow-hidden"
              >
                {/* State group header */}
                <button
                  onClick={() => toggleCollapse(state)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-700/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-cyan-400" />
                    <span className="font-semibold text-white">{state}</span>
                    <Badge variant="secondary" className="text-xs">
                      {areas.length} {areas.length === 1 ? "area" : "areas"}
                    </Badge>
                  </div>
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  )}
                </button>

                {/* Areas list */}
                {!isCollapsed && (
                  <div className="divide-y divide-slate-700/50">
                    {areas.map((area) => (
                      <div
                        key={area.id}
                        className="flex items-center justify-between px-5 py-4 hover:bg-slate-700/20 transition-colors"
                      >
                        {/* Left: postcode + suburb + state */}
                        <div className="flex items-center gap-4 min-w-0">
                          <div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-xl font-bold text-white">
                                {area.postcode}
                              </span>
                              {area.suburb && (
                                <span className="text-slate-300 text-sm">
                                  {area.suburb}
                                </span>
                              )}
                              <span className="text-slate-500 text-xs">
                                {area.state}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {area.radius != null && (
                                <Badge
                                  variant="outline"
                                  className="text-xs border-cyan-500/40 text-cyan-400"
                                >
                                  {area.radius} km radius
                                </Badge>
                              )}
                              <span className="text-xs text-slate-500">
                                Priority: {area.priority}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Right: active toggle + delete */}
                        <div className="flex items-center gap-4 flex-shrink-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs ${area.isActive ? "text-green-400" : "text-slate-500"}`}
                            >
                              {area.isActive ? "Active" : "Inactive"}
                            </span>
                            <Switch
                              checked={area.isActive}
                              onCheckedChange={() => handleToggleActive(area)}
                              aria-label={`Toggle ${area.postcode} active`}
                            />
                          </div>
                          <button
                            onClick={() => handleDelete(area.id)}
                            className="text-red-400 hover:text-red-300 transition-colors"
                            aria-label={`Delete ${area.postcode}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Service Area Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Add Service Area</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Postcode */}
            <div className="space-y-1.5">
              <Label htmlFor="postcode" className="text-slate-300">
                Postcode <span className="text-red-400">*</span>
              </Label>
              <Input
                id="postcode"
                value={form.postcode}
                onChange={(e) =>
                  setForm((f) => ({ ...f, postcode: e.target.value }))
                }
                placeholder="e.g. 2000"
                maxLength={4}
                className="bg-slate-800 border-slate-600 text-white placeholder-slate-500"
              />
            </div>

            {/* Suburb */}
            <div className="space-y-1.5">
              <Label htmlFor="suburb" className="text-slate-300">
                Suburb (optional)
              </Label>
              <Input
                id="suburb"
                value={form.suburb}
                onChange={(e) =>
                  setForm((f) => ({ ...f, suburb: e.target.value }))
                }
                placeholder="e.g. Sydney CBD"
                className="bg-slate-800 border-slate-600 text-white placeholder-slate-500"
              />
            </div>

            {/* State */}
            <div className="space-y-1.5">
              <Label className="text-slate-300">
                State <span className="text-red-400">*</span>
              </Label>
              <Select
                value={form.state}
                onValueChange={(val) => setForm((f) => ({ ...f, state: val }))}
              >
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                  <SelectValue placeholder="Select state..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {AU_STATES.map((s) => (
                    <SelectItem
                      key={s}
                      value={s}
                      className="text-white hover:bg-slate-700"
                    >
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Radius */}
            <div className="space-y-1.5">
              <Label htmlFor="radius" className="text-slate-300">
                Radius (km, optional)
              </Label>
              <Input
                id="radius"
                type="number"
                min={0}
                value={form.radius}
                onChange={(e) =>
                  setForm((f) => ({ ...f, radius: e.target.value }))
                }
                placeholder="e.g. 25"
                className="bg-slate-800 border-slate-600 text-white placeholder-slate-500"
              />
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <Label htmlFor="priority" className="text-slate-300">
                Priority (default 0)
              </Label>
              <Input
                id="priority"
                type="number"
                value={form.priority}
                onChange={(e) =>
                  setForm((f) => ({ ...f, priority: e.target.value }))
                }
                className="bg-slate-800 border-slate-600 text-white"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="border-slate-600 text-slate-300 hover:bg-slate-800"
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={submitting}>
              {submitting ? "Adding..." : "Add Service Area"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
