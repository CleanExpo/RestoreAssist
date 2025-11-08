"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { QuestionCard, Question } from "@/components/restore-assist/QuestionCard";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

type Tier = 1 | 2 | 3;

interface TierQuestions {
  tier: Tier;
  title: string;
  description: string;
  questions: Question[];
}

const tierConfig = {
  1: {
    title: "Tier 1 - Critical Information",
    description: "Essential details required for compliance and safety assessment",
    color: "RED",
  },
  2: {
    title: "Tier 2 - Detailed Assessment",
    description: "Additional context for comprehensive reporting",
    color: "AMBER",
  },
  3: {
    title: "Tier 3 - Optimization",
    description: "Enhanced insights for superior report quality",
    color: "GREEN",
  },
};

// Mock tier questions - in production, these would come from API
const mockTierQuestions: TierQuestions[] = [
  {
    tier: 1,
    title: "Tier 1 - Critical Information",
    description: "Essential details required for compliance and safety assessment",
    questions: [
      {
        id: "water_category",
        text: "What is the water category according to IICRC S500 standards?",
        type: "select",
        required: true,
        options: ["Category 1 (Clean Water)", "Category 2 (Grey Water)", "Category 3 (Black Water)"],
        helpText: "Category determines cleaning and safety protocols",
      },
      {
        id: "water_class",
        text: "What is the water class based on evaporation rate?",
        type: "select",
        required: true,
        options: ["Class 1 (Fast Evaporation)", "Class 2 (Normal)", "Class 3 (Slow)", "Class 4 (Specialty)"],
      },
      {
        id: "safety_hazards",
        text: "Identify any immediate safety hazards",
        type: "checkbox",
        required: true,
        options: [
          "Electrical hazards",
          "Structural damage",
          "Asbestos suspected",
          "Microbial growth",
          "Chemical contamination",
          "None identified",
        ],
      },
      {
        id: "affected_area",
        text: "Total affected area (square meters)",
        type: "number",
        required: true,
        placeholder: "e.g., 45.5",
      },
    ],
  },
  {
    tier: 2,
    title: "Tier 2 - Detailed Assessment",
    description: "Additional context for comprehensive reporting",
    questions: [
      {
        id: "materials_affected",
        text: "What materials are affected?",
        type: "checkbox",
        options: [
          "Carpet/flooring",
          "Drywall/plaster",
          "Timber framing",
          "Insulation",
          "Furniture",
          "Electronics",
          "Documents",
        ],
      },
      {
        id: "hvac_status",
        text: "Is the HVAC system affected or involved?",
        type: "radio",
        options: ["Yes - Contaminated", "Yes - Water damaged", "No", "Unknown"],
      },
      {
        id: "moisture_readings",
        text: "Provide initial moisture meter readings",
        type: "textarea",
        placeholder: "e.g., Living room: 65% RH, Bedroom 1: 78% RH, Wall cavity: 85% MC",
        helpText: "Include relative humidity (RH) and moisture content (MC) readings",
      },
      {
        id: "drying_equipment",
        text: "Recommended drying equipment",
        type: "checkbox",
        options: [
          "Large dehumidifier",
          "Medium dehumidifier",
          "Desiccant dehumidifier",
          "Axial air movers",
          "Centrifugal air movers",
          "Air filtration device",
        ],
      },
    ],
  },
  {
    tier: 3,
    title: "Tier 3 - Optimization",
    description: "Enhanced insights for superior report quality",
    questions: [
      {
        id: "insurance_claim",
        text: "Insurance claim number (if available)",
        type: "text",
        placeholder: "e.g., INS-2025-12345",
      },
      {
        id: "occupancy_status",
        text: "Property occupancy during restoration",
        type: "radio",
        options: ["Occupied - Full access", "Occupied - Limited access", "Vacant", "Commercial"],
      },
      {
        id: "timeline_constraints",
        text: "Any timeline constraints or special requirements?",
        type: "textarea",
        placeholder: "e.g., Must complete before tenant moves in on 01/02/2025",
      },
      {
        id: "additional_notes",
        text: "Additional observations or concerns",
        type: "textarea",
        placeholder: "Any other relevant information...",
      },
    ],
  },
];

export default function EnhanceInspection({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentTier, setCurrentTier] = useState<Tier>(1);
  const [showBasicReport, setShowBasicReport] = useState(false);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reportData, setReportData] = useState<any>(null);

  useEffect(() => {
    fetchReportData();
  }, [params.id]);

  const fetchReportData = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/restore-assist/inspections/${params.id}`);
      if (!response.ok) throw new Error("Failed to fetch report");
      const data = await response.json();
      setReportData(data);
    } catch (error) {
      console.error("Error fetching report:", error);
      toast({
        title: "Error",
        description: "Failed to load inspection data.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUseBasicReport = () => {
    router.push(`/dashboard/restore-assist/inspections/${params.id}`);
  };

  const validateTier = (tier: Tier) => {
    const tierQuestions = mockTierQuestions.find((tq) => tq.tier === tier);
    if (!tierQuestions) return true;

    const newErrors: Record<string, string> = {};

    tierQuestions.questions.forEach((question) => {
      if (question.required && !answers[question.id]) {
        newErrors[question.id] = "This field is required";
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleTierSubmit = async () => {
    if (!validateTier(currentTier)) {
      toast({
        title: "Validation Error",
        description: "Please answer all required questions.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Save tier answers
      const response = await fetch(
        `/api/restore-assist/inspections/${params.id}/enhancement`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tier: currentTier,
            answers,
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to save answers");

      // Move to next tier or generate report
      if (currentTier < 3) {
        setCurrentTier((currentTier + 1) as Tier);
        toast({
          title: "Progress Saved",
          description: `Tier ${currentTier} complete. Moving to Tier ${currentTier + 1}.`,
        });
      } else {
        // Generate enhanced report
        await generateEnhancedReport();
      }
    } catch (error) {
      console.error("Error submitting tier:", error);
      toast({
        title: "Error",
        description: "Failed to save answers. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const generateEnhancedReport = async () => {
    setIsSubmitting(true);

    try {
      const response = await fetch(
        `/api/restore-assist/inspections/${params.id}/generate-enhanced`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) throw new Error("Failed to generate report");

      toast({
        title: "Success",
        description: "Enhanced report generated successfully!",
      });

      router.push(`/dashboard/restore-assist/inspections/${params.id}`);
    } catch (error) {
      console.error("Error generating report:", error);
      toast({
        title: "Error",
        description: "Failed to generate enhanced report. Please try again.",
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentTierData = mockTierQuestions.find((tq) => tq.tier === currentTier);

  return (
    <div className="container mx-auto py-8 max-w-4xl">
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
        <h1 className="text-3xl font-bold">Enhance Inspection Report</h1>
        <p className="text-muted-foreground mt-1">
          Answer questions to generate a comprehensive, compliance-ready report
        </p>
      </div>

      {/* Progress Indicator */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            {[1, 2, 3].map((tier) => (
              <div key={tier} className="flex items-center">
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                    tier < currentTier
                      ? "bg-green-500 border-green-500 text-white"
                      : tier === currentTier
                      ? "bg-blue-500 border-blue-500 text-white"
                      : "bg-gray-200 border-gray-300 text-gray-500"
                  }`}
                >
                  {tier < currentTier ? <CheckCircle2 className="h-5 w-5" /> : tier}
                </div>
                <div className="ml-3">
                  <div className="text-sm font-semibold">Tier {tier}</div>
                  <div className="text-xs text-muted-foreground">
                    {tierConfig[tier as Tier].color}
                  </div>
                </div>
                {tier < 3 && (
                  <div
                    className={`w-16 h-1 mx-4 ${
                      tier < currentTier ? "bg-green-500" : "bg-gray-300"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {!showBasicReport ? (
        <>
          {/* Choice: Basic or Enhanced */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Choose Report Type</CardTitle>
              <CardDescription>
                You can use the basic AI-generated report or enhance it with additional details
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-4">
              <Button
                variant="outline"
                size="lg"
                className="flex-1 h-auto py-6"
                onClick={handleUseBasicReport}
              >
                <div className="text-center">
                  <div className="font-semibold mb-1">Use Basic Report</div>
                  <div className="text-sm text-muted-foreground">
                    Quick report from technician notes
                  </div>
                </div>
              </Button>
              <Button
                size="lg"
                className="flex-1 h-auto py-6"
                onClick={() => setShowBasicReport(true)}
              >
                <div className="text-center">
                  <div className="font-semibold mb-1">Enhance with Questions</div>
                  <div className="text-sm opacity-90">
                    Comprehensive, compliance-ready report
                  </div>
                </div>
              </Button>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          {/* Current Tier Questions */}
          {currentTierData && (
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{currentTierData.title}</CardTitle>
                    <CardDescription className="mt-2">
                      {currentTierData.description}
                    </CardDescription>
                  </div>
                  <Badge
                    className={
                      currentTier === 1
                        ? "bg-red-500"
                        : currentTier === 2
                        ? "bg-amber-500"
                        : "bg-green-500"
                    }
                  >
                    {tierConfig[currentTier].color} TIER
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {currentTierData.questions.map((question) => (
                  <QuestionCard
                    key={question.id}
                    question={question}
                    value={answers[question.id]}
                    onChange={(value) => {
                      setAnswers((prev) => ({ ...prev, [question.id]: value }));
                      setErrors((prev) => {
                        const newErrors = { ...prev };
                        delete newErrors[question.id];
                        return newErrors;
                      });
                    }}
                    tier={currentTier}
                    error={errors[question.id]}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => {
                if (currentTier > 1) {
                  setCurrentTier((currentTier - 1) as Tier);
                } else {
                  setShowBasicReport(false);
                }
              }}
              disabled={isSubmitting}
            >
              {currentTier > 1 ? "Previous Tier" : "Back to Choice"}
            </Button>
            <Button onClick={handleTierSubmit} disabled={isSubmitting} size="lg">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Processing...
                </>
              ) : currentTier < 3 ? (
                "Submit & Continue"
              ) : (
                "Generate Enhanced Report"
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
