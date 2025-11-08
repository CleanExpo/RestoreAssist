"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Loader2,
  Save,
  FileDown,
  Lock,
  Unlock,
  TrendingUp,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { CostLineItem, CostLineItemHeader } from "@/components/restore-assist/CostLineItem";
import { ExportModal } from "@/components/restore-assist/ExportModal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

type EstimateStatus = "DRAFT" | "INTERNAL_REVIEW" | "CLIENT_REVIEW" | "APPROVED" | "LOCKED";

interface LineItem {
  id: string;
  code?: string;
  category: string;
  description: string;
  qty: number;
  unit: string;
  rate: number;
  subtotal: number;
  formula?: string;
  isScopeLinked: boolean;
}

interface EstimateData {
  id: string;
  reportId: string;
  scopeId?: string;
  status: EstimateStatus;
  version: number;
  lineItems: LineItem[];
  labourSubtotal: number;
  equipmentSubtotal: number;
  chemicalsSubtotal: number;
  subcontractorSubtotal: number;
  travelSubtotal: number;
  wasteSubtotal: number;
  overheads: number;
  profit: number;
  contingency: number;
  escalation: number;
  subtotalExGST: number;
  gst: number;
  totalIncGST: number;
  assumptions?: string;
  inclusions?: string;
  exclusions?: string;
  allowances?: string;
  createdAt: Date;
  updatedAt: Date;
}

const statusConfig = {
  DRAFT: { label: "Draft", className: "bg-gray-500" },
  INTERNAL_REVIEW: { label: "Internal Review", className: "bg-blue-500" },
  CLIENT_REVIEW: { label: "Client Review", className: "bg-amber-500" },
  APPROVED: { label: "Approved", className: "bg-green-500" },
  LOCKED: { label: "Locked", className: "bg-purple-500" },
};

const categoryGroups = {
  Labour: ["Prelims", "Mitigation", "Demolition", "Restoration"],
  Equipment: ["Equipment", "Specialist"],
  Other: ["Contents", "Travel", "Compliance", "Admin"],
};

// Mock industry benchmarks
const industryBenchmarks = {
  labourRate: { min: 85, max: 150, avg: 110 },
  equipmentDailyRate: { min: 50, max: 200, avg: 100 },
  overheadPercentage: { min: 10, max: 25, avg: 15 },
  profitMargin: { min: 10, max: 30, avg: 20 },
};

export default function ViewEstimation({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { toast } = useToast();
  const [estimate, setEstimate] = useState<EstimateData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  useEffect(() => {
    fetchEstimate();
  }, [params.id]);

  const fetchEstimate = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/restore-assist/estimations/${params.id}`);
      if (!response.ok) throw new Error("Failed to fetch estimate");
      const data = await response.json();
      setEstimate(data);
      setIsLocked(data.status === "LOCKED");
    } catch (error) {
      console.error("Error fetching estimate:", error);
      toast({
        title: "Error",
        description: "Failed to load estimation data.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/restore-assist/estimations/${params.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(estimate),
      });

      if (!response.ok) throw new Error("Failed to save changes");

      toast({
        title: "Success",
        description: "Changes saved successfully.",
      });

      setHasUnsavedChanges(false);
      fetchEstimate();
    } catch (error) {
      console.error("Error saving estimate:", error);
      toast({
        title: "Error",
        description: "Failed to save changes. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleLock = async () => {
    try {
      const newStatus = isLocked ? "APPROVED" : "LOCKED";
      const response = await fetch(`/api/restore-assist/estimations/${params.id}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) throw new Error("Failed to update status");

      setIsLocked(!isLocked);
      toast({
        title: "Success",
        description: isLocked ? "Estimate unlocked for editing." : "Estimate locked.",
      });

      fetchEstimate();
    } catch (error) {
      console.error("Error toggling lock:", error);
      toast({
        title: "Error",
        description: "Failed to update estimate status.",
        variant: "destructive",
      });
    }
  };

  const handleUpdateLineItem = (itemId: string, field: string, value: any) => {
    if (!estimate || isLocked) return;

    const updatedItems = estimate.lineItems.map((item) => {
      if (item.id === itemId && !item.isScopeLinked) {
        const updatedItem = { ...item, [field]: value };
        updatedItem.subtotal = updatedItem.qty * updatedItem.rate;
        return updatedItem;
      }
      return item;
    });

    // Recalculate totals
    const newEstimate = { ...estimate, lineItems: updatedItems };
    recalculateTotals(newEstimate);

    setEstimate(newEstimate);
    setHasUnsavedChanges(true);
  };

  const handleDeleteLineItem = (itemId: string) => {
    if (!estimate || isLocked) return;

    const item = estimate.lineItems.find((i) => i.id === itemId);
    if (item?.isScopeLinked) {
      toast({
        title: "Cannot Delete",
        description: "This item is linked to the scope and cannot be deleted.",
        variant: "destructive",
      });
      return;
    }

    const updatedItems = estimate.lineItems.filter((item) => item.id !== itemId);
    const newEstimate = { ...estimate, lineItems: updatedItems };
    recalculateTotals(newEstimate);

    setEstimate(newEstimate);
    setHasUnsavedChanges(true);
  };

  const recalculateTotals = (est: EstimateData) => {
    // Calculate category subtotals
    est.labourSubtotal = est.lineItems
      .filter((item) =>
        ["Prelims", "Mitigation", "Demolition", "Restoration"].includes(item.category)
      )
      .reduce((sum, item) => sum + item.subtotal, 0);

    est.equipmentSubtotal = est.lineItems
      .filter((item) => ["Equipment", "Specialist"].includes(item.category))
      .reduce((sum, item) => sum + item.subtotal, 0);

    est.chemicalsSubtotal = est.lineItems
      .filter((item) => item.category === "Chemicals")
      .reduce((sum, item) => sum + item.subtotal, 0);

    // Calculate final totals
    const directCosts =
      est.labourSubtotal +
      est.equipmentSubtotal +
      est.chemicalsSubtotal +
      est.subcontractorSubtotal +
      est.travelSubtotal +
      est.wasteSubtotal;

    est.subtotalExGST =
      directCosts + est.overheads + est.profit + est.contingency + est.escalation;
    est.gst = est.subtotalExGST * 0.1;
    est.totalIncGST = est.subtotalExGST + est.gst;
  };

  const handleExport = async (options: any) => {
    try {
      const response = await fetch(`/api/restore-assist/estimations/${params.id}/export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(options),
      });

      if (!response.ok) throw new Error("Failed to export estimate");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `estimate-${params.id}.${options.format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Success",
        description: "Estimate exported successfully.",
      });
    } catch (error) {
      console.error("Error exporting estimate:", error);
      toast({
        title: "Error",
        description: "Failed to export estimate. Please try again.",
        variant: "destructive",
      });
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  const getBenchmarkComparison = (category: string, value: number) => {
    const benchmark = industryBenchmarks[category as keyof typeof industryBenchmarks];
    if (!benchmark) return null;

    if (value < benchmark.min) return "below";
    if (value > benchmark.max) return "above";
    return "within";
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!estimate) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Estimation Not Found</h2>
          <p className="text-muted-foreground mb-4">
            The cost estimation you're looking for doesn't exist.
          </p>
          <Button onClick={() => router.push("/dashboard/restore-assist")}>
            Back to Inspections
          </Button>
        </div>
      </div>
    );
  }

  const labourItems = estimate.lineItems.filter((item) =>
    categoryGroups.Labour.includes(item.category)
  );
  const equipmentItems = estimate.lineItems.filter((item) =>
    ["Equipment", "Specialist"].includes(item.category)
  );
  const otherItems = estimate.lineItems.filter(
    (item) => !categoryGroups.Labour.includes(item.category) && !["Equipment", "Specialist"].includes(item.category)
  );

  return (
    <div className="container mx-auto py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() =>
            router.push(`/dashboard/restore-assist/inspections/${estimate.reportId}`)
          }
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Inspection
        </Button>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">Cost Estimation</h1>
              <Badge className={statusConfig[estimate.status].className}>
                {statusConfig[estimate.status].label}
              </Badge>
              <Badge variant="outline">Version {estimate.version}</Badge>
            </div>
            <p className="text-muted-foreground">
              Detailed cost breakdown and financial analysis
            </p>
          </div>
          <div className="flex gap-2">
            <div className="flex items-center gap-2 mr-4">
              <Label htmlFor="lock-toggle">{isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}</Label>
              <Switch
                id="lock-toggle"
                checked={isLocked}
                onCheckedChange={handleToggleLock}
              />
            </div>
            <Button
              onClick={handleSaveChanges}
              disabled={isSaving || !hasUnsavedChanges || isLocked}
            >
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
            <Button variant="outline" onClick={() => setShowExportModal(true)}>
              <FileDown className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>
      </div>

      {isLocked && (
        <Alert className="mb-6">
          <Lock className="h-4 w-4" />
          <AlertDescription>
            This estimate is locked. Toggle the lock switch to make changes.
          </AlertDescription>
        </Alert>
      )}

      {/* Summary */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Financial Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-6 mb-6">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Labour</div>
              <div className="text-2xl font-bold">{formatCurrency(estimate.labourSubtotal)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Equipment</div>
              <div className="text-2xl font-bold">{formatCurrency(estimate.equipmentSubtotal)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Chemicals</div>
              <div className="text-2xl font-bold">{formatCurrency(estimate.chemicalsSubtotal)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Other</div>
              <div className="text-2xl font-bold">
                {formatCurrency(
                  estimate.subcontractorSubtotal + estimate.travelSubtotal + estimate.wasteSubtotal
                )}
              </div>
            </div>
          </div>
          <Separator className="my-6" />
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>Overheads</span>
              <span className="font-medium">{formatCurrency(estimate.overheads)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Profit</span>
              <span className="font-medium">{formatCurrency(estimate.profit)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Contingency</span>
              <span className="font-medium">{formatCurrency(estimate.contingency)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Escalation</span>
              <span className="font-medium">{formatCurrency(estimate.escalation)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Subtotal (Ex GST)</span>
              <span>{formatCurrency(estimate.subtotalExGST)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>GST (10%)</span>
              <span className="font-medium">{formatCurrency(estimate.gst)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-xl font-bold text-primary">
              <span>Total (Inc GST)</span>
              <span>{formatCurrency(estimate.totalIncGST)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="breakdown" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="breakdown">Cost Breakdown</TabsTrigger>
          <TabsTrigger value="benchmarks">Industry Comparison</TabsTrigger>
          <TabsTrigger value="assumptions">Terms & Assumptions</TabsTrigger>
        </TabsList>

        {/* Cost Breakdown Tab */}
        <TabsContent value="breakdown" className="space-y-6">
          {/* Labour */}
          <Card>
            <CardHeader>
              <CardTitle>Labour Costs</CardTitle>
              <CardDescription>
                {formatCurrency(estimate.labourSubtotal)} • {labourItems.length} items
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CostLineItemHeader />
              {labourItems.map((item) => (
                <CostLineItem
                  key={item.id}
                  code={item.code}
                  description={item.description}
                  quantity={item.qty}
                  unit={item.unit}
                  rate={item.rate}
                  subtotal={item.subtotal}
                  formula={item.formula}
                  isEditable={!isLocked}
                  isScopeLinked={item.isScopeLinked}
                  onUpdate={(field, value) => handleUpdateLineItem(item.id, field, value)}
                  onDelete={() => handleDeleteLineItem(item.id)}
                />
              ))}
            </CardContent>
          </Card>

          {/* Equipment */}
          <Card>
            <CardHeader>
              <CardTitle>Equipment Costs</CardTitle>
              <CardDescription>
                {formatCurrency(estimate.equipmentSubtotal)} • {equipmentItems.length} items
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CostLineItemHeader />
              {equipmentItems.map((item) => (
                <CostLineItem
                  key={item.id}
                  code={item.code}
                  description={item.description}
                  quantity={item.qty}
                  unit={item.unit}
                  rate={item.rate}
                  subtotal={item.subtotal}
                  formula={item.formula}
                  isEditable={!isLocked}
                  isScopeLinked={item.isScopeLinked}
                  onUpdate={(field, value) => handleUpdateLineItem(item.id, field, value)}
                  onDelete={() => handleDeleteLineItem(item.id)}
                />
              ))}
            </CardContent>
          </Card>

          {/* Chemicals & Other */}
          {otherItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Other Costs</CardTitle>
                <CardDescription>{otherItems.length} items</CardDescription>
              </CardHeader>
              <CardContent>
                <CostLineItemHeader />
                {otherItems.map((item) => (
                  <CostLineItem
                    key={item.id}
                    code={item.code}
                    description={item.description}
                    quantity={item.qty}
                    unit={item.unit}
                    rate={item.rate}
                    subtotal={item.subtotal}
                    formula={item.formula}
                    isEditable={!isLocked}
                    isScopeLinked={item.isScopeLinked}
                    onUpdate={(field, value) => handleUpdateLineItem(item.id, field, value)}
                    onDelete={() => handleDeleteLineItem(item.id)}
                  />
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Industry Benchmarks Tab */}
        <TabsContent value="benchmarks" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                <CardTitle>Industry Comparison</CardTitle>
              </div>
              <CardDescription>
                Compare your rates against industry averages
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold">Labour Rate</span>
                    <Badge>
                      Industry Avg: {formatCurrency(industryBenchmarks.labourRate.avg)}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Range: {formatCurrency(industryBenchmarks.labourRate.min)} -{" "}
                    {formatCurrency(industryBenchmarks.labourRate.max)}
                  </div>
                </div>
                <Separator />
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold">Equipment Daily Rate</span>
                    <Badge>
                      Industry Avg: {formatCurrency(industryBenchmarks.equipmentDailyRate.avg)}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Range: {formatCurrency(industryBenchmarks.equipmentDailyRate.min)} -{" "}
                    {formatCurrency(industryBenchmarks.equipmentDailyRate.max)}
                  </div>
                </div>
                <Separator />
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold">Overhead Percentage</span>
                    <Badge>
                      Industry Avg: {industryBenchmarks.overheadPercentage.avg}%
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Range: {industryBenchmarks.overheadPercentage.min}% -{" "}
                    {industryBenchmarks.overheadPercentage.max}%
                  </div>
                </div>
                <Separator />
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold">Profit Margin</span>
                    <Badge>
                      Industry Avg: {industryBenchmarks.profitMargin.avg}%
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Range: {industryBenchmarks.profitMargin.min}% -{" "}
                    {industryBenchmarks.profitMargin.max}%
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Assumptions Tab */}
        <TabsContent value="assumptions" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Exclusions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose max-w-none">
                <ul className="list-disc pl-5 space-y-2">
                  <li>Asbestos testing and removal (if required)</li>
                  <li>Structural repairs beyond water damage</li>
                  <li>Electrical or plumbing repairs</li>
                  <li>Building permit fees</li>
                  <li>After-hours or emergency callout fees</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assumptions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose max-w-none">
                <ul className="list-disc pl-5 space-y-2">
                  <li>Normal business hours access (Monday-Friday, 8am-4pm)</li>
                  <li>Clear and safe working environment</li>
                  <li>Power and water available on-site</li>
                  <li>No hazardous materials present</li>
                  <li>Client to provide adequate parking</li>
                  <li>Quote valid for 30 days</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>GST Clarification</CardTitle>
            </CardHeader>
            <CardContent>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>Important:</strong> All prices are quoted in Australian Dollars (AUD)
                  and include 10% GST unless otherwise stated. The total amount shown includes
                  GST calculated on the subtotal of all line items, overheads, profit, and
                  allowances.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Export Modal */}
      <ExportModal
        open={showExportModal}
        onOpenChange={setShowExportModal}
        onExport={handleExport}
        reportId={estimate.reportId}
      />
    </div>
  );
}
