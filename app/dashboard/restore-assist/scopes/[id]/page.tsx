"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Save, Calculator, Plus } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { PhaseSection } from "@/components/restore-assist/PhaseSection";
import { CostLineItem, CostLineItemHeader } from "@/components/restore-assist/CostLineItem";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PhaseItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  hours: number;
  rate: number;
  subtotal: number;
}

interface Phase {
  id: string;
  name: string;
  description: string;
  status: "pending" | "in-progress" | "completed";
  items: PhaseItem[];
}

interface ScopeData {
  id: string;
  reportId: string;
  scopeType: string;
  phases: Phase[];
  labourCostTotal: number;
  equipmentCostTotal: number;
  chemicalCostTotal: number;
  totalDuration: number;
  createdAt: Date;
  updatedAt: Date;
}

export default function ViewScope({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { toast } = useToast();
  const [scope, setScope] = useState<ScopeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingEstimate, setIsGeneratingEstimate] = useState(false);
  const [showAddItemDialog, setShowAddItemDialog] = useState(false);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string>("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // New item form state
  const [newItem, setNewItem] = useState({
    description: "",
    quantity: 1,
    unit: "ea",
    hours: 0,
    rate: 0,
  });

  useEffect(() => {
    fetchScope();
  }, [params.id]);

  const fetchScope = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/restore-assist/scopes/${params.id}`);
      if (!response.ok) throw new Error("Failed to fetch scope");
      const data = await response.json();
      setScope(data);
    } catch (error) {
      console.error("Error fetching scope:", error);
      toast({
        title: "Error",
        description: "Failed to load scope data.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/restore-assist/scopes/${params.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(scope),
      });

      if (!response.ok) throw new Error("Failed to save changes");

      toast({
        title: "Success",
        description: "Changes saved successfully.",
      });

      setHasUnsavedChanges(false);
      fetchScope();
    } catch (error) {
      console.error("Error saving scope:", error);
      toast({
        title: "Error",
        description: "Failed to save changes. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateEstimate = async () => {
    setIsGeneratingEstimate(true);
    try {
      const response = await fetch(`/api/restore-assist/scopes/${params.id}/estimate`, {
        method: "POST",
      });

      if (!response.ok) throw new Error("Failed to generate estimate");

      const data = await response.json();

      toast({
        title: "Success",
        description: "Cost estimation generated successfully.",
      });

      router.push(`/dashboard/restore-assist/estimations/${data.estimateId}`);
    } catch (error) {
      console.error("Error generating estimate:", error);
      toast({
        title: "Error",
        description: "Failed to generate estimate. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingEstimate(false);
    }
  };

  const handleUpdateItem = (phaseId: string, itemId: string, field: string, value: any) => {
    if (!scope) return;

    const updatedPhases = scope.phases.map((phase) => {
      if (phase.id === phaseId) {
        const updatedItems = phase.items.map((item) => {
          if (item.id === itemId) {
            const updatedItem = { ...item, [field]: value };
            // Recalculate subtotal
            updatedItem.subtotal = updatedItem.quantity * updatedItem.rate;
            return updatedItem;
          }
          return item;
        });
        return { ...phase, items: updatedItems };
      }
      return phase;
    });

    setScope({ ...scope, phases: updatedPhases });
    setHasUnsavedChanges(true);
  };

  const handleDeleteItem = (phaseId: string, itemId: string) => {
    if (!scope) return;

    const updatedPhases = scope.phases.map((phase) => {
      if (phase.id === phaseId) {
        return {
          ...phase,
          items: phase.items.filter((item) => item.id !== itemId),
        };
      }
      return phase;
    });

    setScope({ ...scope, phases: updatedPhases });
    setHasUnsavedChanges(true);
  };

  const handleAddItem = () => {
    if (!scope || !selectedPhaseId) return;

    const item: PhaseItem = {
      id: `item-${Date.now()}`,
      description: newItem.description,
      quantity: newItem.quantity,
      unit: newItem.unit,
      hours: newItem.hours,
      rate: newItem.rate,
      subtotal: newItem.quantity * newItem.rate,
    };

    const updatedPhases = scope.phases.map((phase) => {
      if (phase.id === selectedPhaseId) {
        return {
          ...phase,
          items: [...phase.items, item],
        };
      }
      return phase;
    });

    setScope({ ...scope, phases: updatedPhases });
    setHasUnsavedChanges(true);
    setShowAddItemDialog(false);
    setNewItem({
      description: "",
      quantity: 1,
      unit: "ea",
      hours: 0,
      rate: 0,
    });

    toast({
      title: "Success",
      description: "Item added successfully.",
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(value);
  };

  const calculateTotals = () => {
    if (!scope) return { labour: 0, equipment: 0, chemical: 0, total: 0 };

    // Simple calculation - in production, this would be more sophisticated
    const total = scope.phases.reduce(
      (sum, phase) =>
        sum + phase.items.reduce((itemSum, item) => itemSum + item.subtotal, 0),
      0
    );

    return {
      labour: scope.labourCostTotal || 0,
      equipment: scope.equipmentCostTotal || 0,
      chemical: scope.chemicalCostTotal || 0,
      total,
    };
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!scope) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Scope Not Found</h2>
          <p className="text-muted-foreground mb-4">
            The scope you're looking for doesn't exist.
          </p>
          <Button onClick={() => router.push("/dashboard/restore-assist")}>
            Back to Inspections
          </Button>
        </div>
      </div>
    );
  }

  const totals = calculateTotals();

  return (
    <div className="container mx-auto py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => router.push(`/dashboard/restore-assist/inspections/${scope.reportId}`)}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Inspection
        </Button>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">Scope of Works</h1>
              <Badge>{scope.scopeType}</Badge>
            </div>
            <p className="text-muted-foreground">
              Detailed restoration plan and resource allocation
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSelectedPhaseId(scope.phases[0]?.id || "");
                setShowAddItemDialog(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Item
            </Button>
            <Button onClick={handleSaveChanges} disabled={isSaving || !hasUnsavedChanges}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Summary Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-6">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Labour Costs</div>
              <div className="text-2xl font-bold">{formatCurrency(totals.labour)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Equipment Costs</div>
              <div className="text-2xl font-bold">{formatCurrency(totals.equipment)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Chemical Costs</div>
              <div className="text-2xl font-bold">{formatCurrency(totals.chemical)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Total Duration</div>
              <div className="text-2xl font-bold">{scope.totalDuration || 0} days</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Phases */}
      <div className="space-y-4 mb-6">
        {scope.phases.map((phase) => (
          <PhaseSection
            key={phase.id}
            title={phase.name}
            description={phase.description}
            status={phase.status}
            items={phase.items}
          >
            <div className="space-y-2">
              <CostLineItemHeader />
              {phase.items.map((item) => (
                <CostLineItem
                  key={item.id}
                  description={item.description}
                  quantity={item.quantity}
                  unit={item.unit}
                  rate={item.rate}
                  subtotal={item.subtotal}
                  formula={item.hours ? `${item.hours} hours @ ${formatCurrency(item.rate)}` : undefined}
                  isEditable={true}
                  onUpdate={(field, value) => handleUpdateItem(phase.id, item.id, field, value)}
                  onDelete={() => handleDeleteItem(phase.id, item.id)}
                />
              ))}
            </div>
          </PhaseSection>
        ))}
      </div>

      {/* Generate Estimate CTA */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold mb-1">Ready to generate cost estimation?</h3>
              <p className="text-sm text-muted-foreground">
                Create detailed cost breakdown based on this scope
              </p>
            </div>
            <Button onClick={handleGenerateEstimate} disabled={isGeneratingEstimate} size="lg">
              {isGeneratingEstimate ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Calculator className="mr-2 h-5 w-5" />
                  Generate Cost Estimation
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Add Item Dialog */}
      <Dialog open={showAddItemDialog} onOpenChange={setShowAddItemDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Line Item</DialogTitle>
            <DialogDescription>Add a new item to the scope of works</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Phase</Label>
              <Select value={selectedPhaseId} onValueChange={setSelectedPhaseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select phase" />
                </SelectTrigger>
                <SelectContent>
                  {scope.phases.map((phase) => (
                    <SelectItem key={phase.id} value={phase.id}>
                      {phase.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                placeholder="e.g., Install dehumidifier"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  value={newItem.quantity}
                  onChange={(e) =>
                    setNewItem({ ...newItem, quantity: parseFloat(e.target.value) || 0 })
                  }
                  step="0.01"
                />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select value={newItem.unit} onValueChange={(v) => setNewItem({ ...newItem, unit: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ea">Each (ea)</SelectItem>
                    <SelectItem value="hr">Hours (hr)</SelectItem>
                    <SelectItem value="day">Days (day)</SelectItem>
                    <SelectItem value="sqm">Square Meters (m²)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Hours</Label>
                <Input
                  type="number"
                  value={newItem.hours}
                  onChange={(e) =>
                    setNewItem({ ...newItem, hours: parseFloat(e.target.value) || 0 })
                  }
                  step="0.5"
                />
              </div>
              <div className="space-y-2">
                <Label>Rate (AUD)</Label>
                <Input
                  type="number"
                  value={newItem.rate}
                  onChange={(e) =>
                    setNewItem({ ...newItem, rate: parseFloat(e.target.value) || 0 })
                  }
                  step="0.01"
                />
              </div>
            </div>
            <div className="pt-2">
              <div className="text-sm text-muted-foreground">Subtotal</div>
              <div className="text-2xl font-bold">
                {formatCurrency(newItem.quantity * newItem.rate)}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddItemDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddItem} disabled={!newItem.description || !selectedPhaseId}>
              Add Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
