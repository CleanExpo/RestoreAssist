"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";

export default function NewInspection() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [claimReference, setClaimReference] = useState("");
  const [clientName, setClientName] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [incidentDate, setIncidentDate] = useState<Date>();
  const [technicianReport, setTechnicianReport] = useState("");

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!claimReference.trim()) {
      newErrors.claimReference = "Claim reference is required";
    }
    if (!clientName.trim()) {
      newErrors.clientName = "Client name is required";
    }
    if (!propertyAddress.trim()) {
      newErrors.propertyAddress = "Property address is required";
    }
    if (!incidentDate) {
      newErrors.incidentDate = "Incident date is required";
    }
    if (!technicianReport.trim()) {
      newErrors.technicianReport = "Technician report is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/restore-assist/inspections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reportNumber: claimReference,
          clientName,
          propertyAddress,
          inspectionDate: incidentDate?.toISOString(),
          technicianNotes: technicianReport,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create inspection");
      }

      const data = await response.json();

      toast({
        title: "Success",
        description: "Initial report generated successfully.",
      });

      // Redirect to enhancement workflow
      router.push(`/dashboard/restore-assist/inspections/${data.id}/enhance`);
    } catch (error) {
      console.error("Error creating inspection:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create inspection. Please try again.",
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto py-8 max-w-3xl">
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
        <h1 className="text-3xl font-bold">New Inspection</h1>
        <p className="text-muted-foreground mt-1">
          Create a new water damage inspection report
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Inspection Details</CardTitle>
            <CardDescription>
              Enter basic information about the inspection and paste the technician's initial
              report.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Claim Reference */}
            <div className="space-y-2">
              <Label htmlFor="claimReference">
                Claim Reference <span className="text-red-500">*</span>
              </Label>
              <Input
                id="claimReference"
                value={claimReference}
                onChange={(e) => setClaimReference(e.target.value)}
                placeholder="e.g., CLM-2025-001"
                className={cn(errors.claimReference && "border-red-500")}
              />
              {errors.claimReference && (
                <p className="text-sm text-red-500">{errors.claimReference}</p>
              )}
            </div>

            {/* Client Name */}
            <div className="space-y-2">
              <Label htmlFor="clientName">
                Client Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="clientName"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g., John Smith"
                className={cn(errors.clientName && "border-red-500")}
              />
              {errors.clientName && <p className="text-sm text-red-500">{errors.clientName}</p>}
            </div>

            {/* Property Address */}
            <div className="space-y-2">
              <Label htmlFor="propertyAddress">
                Property Address <span className="text-red-500">*</span>
              </Label>
              <Input
                id="propertyAddress"
                value={propertyAddress}
                onChange={(e) => setPropertyAddress(e.target.value)}
                placeholder="e.g., 123 Main Street, Sydney NSW 2000"
                className={cn(errors.propertyAddress && "border-red-500")}
              />
              {errors.propertyAddress && (
                <p className="text-sm text-red-500">{errors.propertyAddress}</p>
              )}
            </div>

            {/* Incident Date */}
            <div className="space-y-2">
              <Label>
                Incident Date <span className="text-red-500">*</span>
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !incidentDate && "text-muted-foreground",
                      errors.incidentDate && "border-red-500"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {incidentDate ? format(incidentDate, "PPP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={incidentDate}
                    onSelect={setIncidentDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              {errors.incidentDate && (
                <p className="text-sm text-red-500">{errors.incidentDate}</p>
              )}
            </div>

            {/* Technician Report */}
            <div className="space-y-2">
              <Label htmlFor="technicianReport">
                Technician Report <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="technicianReport"
                value={technicianReport}
                onChange={(e) => setTechnicianReport(e.target.value)}
                placeholder="Paste or type the technician's initial assessment report here..."
                rows={12}
                className={cn(errors.technicianReport && "border-red-500")}
              />
              <p className="text-sm text-muted-foreground">
                Include details about water damage, affected areas, initial observations, and any
                immediate concerns.
              </p>
              {errors.technicianReport && (
                <p className="text-sm text-red-500">{errors.technicianReport}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-between mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/dashboard/restore-assist")}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting} size="lg">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Generating Report...
              </>
            ) : (
              "Generate Initial Report"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
