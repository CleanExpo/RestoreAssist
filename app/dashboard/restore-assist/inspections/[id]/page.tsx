"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Edit,
  RefreshCw,
  FileDown,
  Trash2,
  Loader2,
  Clock,
  FileText,
  Calculator,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { format } from "date-fns";
import { ExportModal } from "@/components/restore-assist/ExportModal";
import { HazardList } from "@/components/restore-assist/HazardFlag";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ReportStatus = "DRAFT" | "PENDING" | "APPROVED" | "COMPLETED" | "ARCHIVED";

interface InspectionData {
  id: string;
  reportNumber?: string;
  clientName: string;
  propertyAddress: string;
  inspectionDate?: Date;
  status: ReportStatus;
  waterCategory?: string;
  waterClass?: string;
  affectedArea?: number;
  detailedReport?: string;
  safetyHazards?: string;
  createdAt: Date;
  updatedAt: Date;
  scope?: {
    id: string;
    status: string;
  };
  estimates?: Array<{
    id: string;
    status: string;
    version: number;
  }>;
}

const statusConfig = {
  DRAFT: { label: "Draft", className: "bg-gray-500" },
  PENDING: { label: "Preliminary", className: "bg-blue-500" },
  APPROVED: { label: "Approved", className: "bg-green-500" },
  COMPLETED: { label: "Final", className: "bg-purple-500" },
  ARCHIVED: { label: "Archived", className: "bg-slate-500" },
};

export default function ViewInspection({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { toast } = useToast();
  const [inspection, setInspection] = useState<InspectionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGeneratingScope, setIsGeneratingScope] = useState(false);

  useEffect(() => {
    fetchInspection();
  }, [params.id]);

  const fetchInspection = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/restore-assist/inspections/${params.id}`);
      if (!response.ok) throw new Error("Failed to fetch inspection");
      const data = await response.json();
      setInspection(data);
    } catch (error) {
      console.error("Error fetching inspection:", error);
      toast({
        title: "Error",
        description: "Failed to load inspection data.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      const response = await fetch(`/api/restore-assist/inspections/${params.id}/regenerate`, {
        method: "POST",
      });

      if (!response.ok) throw new Error("Failed to regenerate report");

      toast({
        title: "Success",
        description: "Report regenerated successfully.",
      });

      fetchInspection();
    } catch (error) {
      console.error("Error regenerating report:", error);
      toast({
        title: "Error",
        description: "Failed to regenerate report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleGenerateScope = async () => {
    setIsGeneratingScope(true);
    try {
      const response = await fetch(`/api/restore-assist/inspections/${params.id}/scope`, {
        method: "POST",
      });

      if (!response.ok) throw new Error("Failed to generate scope");

      const data = await response.json();

      toast({
        title: "Success",
        description: "Scope of works generated successfully.",
      });

      router.push(`/dashboard/restore-assist/scopes/${data.scopeId}`);
    } catch (error) {
      console.error("Error generating scope:", error);
      toast({
        title: "Error",
        description: "Failed to generate scope. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingScope(false);
    }
  };

  const handleExport = async (options: any) => {
    try {
      const response = await fetch(`/api/restore-assist/inspections/${params.id}/export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(options),
      });

      if (!response.ok) throw new Error("Failed to export report");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `inspection-${inspection?.reportNumber || params.id}.${options.format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Success",
        description: "Report exported successfully.",
      });
    } catch (error) {
      console.error("Error exporting report:", error);
      toast({
        title: "Error",
        description: "Failed to export report. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/restore-assist/inspections/${params.id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete inspection");

      toast({
        title: "Success",
        description: "Inspection deleted successfully.",
      });

      router.push("/dashboard/restore-assist");
    } catch (error) {
      console.error("Error deleting inspection:", error);
      toast({
        title: "Error",
        description: "Failed to delete inspection. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Inspection Not Found</h2>
          <p className="text-muted-foreground mb-4">
            The inspection you're looking for doesn't exist.
          </p>
          <Button onClick={() => router.push("/dashboard/restore-assist")}>
            Back to Inspections
          </Button>
        </div>
      </div>
    );
  }

  // Parse safety hazards for hazard display
  const hazards = inspection.safetyHazards
    ? inspection.safetyHazards.split(",").map((hazard, index) => ({
        id: `hazard-${index}`,
        level: hazard.toLowerCase().includes("asbestos") ||
          hazard.toLowerCase().includes("structural")
          ? ("critical" as const)
          : hazard.toLowerCase().includes("electrical")
          ? ("warning" as const)
          : ("info" as const),
        title: hazard.trim(),
        description: `Safety hazard identified during inspection`,
      }))
    : [];

  return (
    <div className="container mx-auto py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => router.push("/dashboard/restore-assist")}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Inspections
        </Button>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">
                {inspection.reportNumber || `Inspection ${params.id.slice(0, 8)}`}
              </h1>
              <Badge className={statusConfig[inspection.status].className}>
                {statusConfig[inspection.status].label}
              </Badge>
            </div>
            <div className="text-muted-foreground space-y-1">
              <p>
                <strong>Client:</strong> {inspection.clientName}
              </p>
              <p>
                <strong>Property:</strong> {inspection.propertyAddress}
              </p>
              {inspection.inspectionDate && (
                <p>
                  <strong>Inspection Date:</strong>{" "}
                  {format(new Date(inspection.inspectionDate), "dd MMMM yyyy")}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => router.push(`/dashboard/restore-assist/inspections/${params.id}/enhance`)}
            >
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button variant="outline" onClick={handleRegenerate} disabled={isRegenerating}>
              {isRegenerating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Regenerate
            </Button>
            <Button variant="outline" onClick={() => setShowExportModal(true)}>
              <FileDown className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(true)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Safety Hazards */}
      {hazards.length > 0 && (
        <div className="mb-6">
          <HazardList hazards={hazards} />
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="inspection" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="inspection">
            <FileText className="mr-2 h-4 w-4" />
            Inspection Report
          </TabsTrigger>
          <TabsTrigger value="scope" disabled={!inspection.scope}>
            <Clock className="mr-2 h-4 w-4" />
            Scope of Works
            {!inspection.scope && " (Not Generated)"}
          </TabsTrigger>
          <TabsTrigger value="estimation" disabled={!inspection.estimates?.length}>
            <Calculator className="mr-2 h-4 w-4" />
            Cost Estimation
            {!inspection.estimates?.length && " (Not Generated)"}
          </TabsTrigger>
        </TabsList>

        {/* Inspection Tab */}
        <TabsContent value="inspection" className="space-y-6">
          {/* Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle>Inspection Summary</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Water Category</div>
                <div className="font-semibold">{inspection.waterCategory || "Not specified"}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Water Class</div>
                <div className="font-semibold">{inspection.waterClass || "Not specified"}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Affected Area</div>
                <div className="font-semibold">
                  {inspection.affectedArea ? `${inspection.affectedArea} m²` : "Not specified"}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Last Updated</div>
                <div className="font-semibold">
                  {format(new Date(inspection.updatedAt), "dd/MM/yyyy HH:mm")}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Detailed Report */}
          <Card>
            <CardHeader>
              <CardTitle>Detailed Report</CardTitle>
              <CardDescription>Complete inspection findings and recommendations</CardDescription>
            </CardHeader>
            <CardContent>
              {inspection.detailedReport ? (
                <div className="prose max-w-none">
                  <pre className="whitespace-pre-wrap font-sans text-sm">
                    {inspection.detailedReport}
                  </pre>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  No detailed report generated yet. Click "Regenerate" to create one.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          {!inspection.scope && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold mb-1">Ready to create a scope of works?</h3>
                    <p className="text-sm text-muted-foreground">
                      Generate a detailed scope based on this inspection
                    </p>
                  </div>
                  <Button onClick={handleGenerateScope} disabled={isGeneratingScope}>
                    {isGeneratingScope ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      "Generate Scope of Works"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Scope Tab */}
        <TabsContent value="scope">
          {inspection.scope && (
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-muted-foreground mb-4">
                  Scope of works has been generated for this inspection.
                </p>
                <Button
                  onClick={() =>
                    router.push(`/dashboard/restore-assist/scopes/${inspection.scope?.id}`)
                  }
                >
                  View Scope of Works
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Estimation Tab */}
        <TabsContent value="estimation">
          {inspection.estimates && inspection.estimates.length > 0 && (
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-muted-foreground mb-4">
                  {inspection.estimates.length} cost estimation(s) available.
                </p>
                <Button
                  onClick={() =>
                    router.push(
                      `/dashboard/restore-assist/estimations/${inspection.estimates?.[0]?.id}`
                    )
                  }
                >
                  View Latest Estimation
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Export Modal */}
      <ExportModal
        open={showExportModal}
        onOpenChange={setShowExportModal}
        onExport={handleExport}
        reportId={params.id}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the inspection and all
              associated data including scope of works and cost estimations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive">
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Inspection"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
