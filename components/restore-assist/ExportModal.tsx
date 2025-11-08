"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { FileDown, FileText, FileJson, Loader2 } from "lucide-react";
import { useState } from "react";

export type ExportFormat = "pdf" | "docx" | "json";

interface ExportOptions {
  format: ExportFormat;
  includeInspection: boolean;
  includeScope: boolean;
  includeEstimate: boolean;
  includeAttachments: boolean;
}

interface ExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (options: ExportOptions) => Promise<void>;
  reportId?: string;
}

const formatIcons = {
  pdf: FileText,
  docx: FileText,
  json: FileJson,
};

export function ExportModal({ open, onOpenChange, onExport, reportId }: ExportModalProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [includeInspection, setIncludeInspection] = useState(true);
  const [includeScope, setIncludeScope] = useState(true);
  const [includeEstimate, setIncludeEstimate] = useState(true);
  const [includeAttachments, setIncludeAttachments] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await onExport({
        format,
        includeInspection,
        includeScope,
        includeEstimate,
        includeAttachments,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Report Package</DialogTitle>
          <DialogDescription>
            Choose format and select which sections to include in the export.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Format Selection */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Export Format</Label>
            <RadioGroup value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pdf" id="format-pdf" />
                <Label htmlFor="format-pdf" className="flex items-center gap-2 font-normal cursor-pointer">
                  <FileText className="h-4 w-4" />
                  PDF Document
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="docx" id="format-docx" />
                <Label htmlFor="format-docx" className="flex items-center gap-2 font-normal cursor-pointer">
                  <FileText className="h-4 w-4" />
                  Word Document (.docx)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="json" id="format-json" />
                <Label htmlFor="format-json" className="flex items-center gap-2 font-normal cursor-pointer">
                  <FileJson className="h-4 w-4" />
                  JSON Data
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Section Selection */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Include Sections</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-inspection"
                  checked={includeInspection}
                  onCheckedChange={(checked) => setIncludeInspection(checked as boolean)}
                />
                <Label htmlFor="include-inspection" className="font-normal cursor-pointer">
                  Inspection Report
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-scope"
                  checked={includeScope}
                  onCheckedChange={(checked) => setIncludeScope(checked as boolean)}
                />
                <Label htmlFor="include-scope" className="font-normal cursor-pointer">
                  Scope of Works
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-estimate"
                  checked={includeEstimate}
                  onCheckedChange={(checked) => setIncludeEstimate(checked as boolean)}
                />
                <Label htmlFor="include-estimate" className="font-normal cursor-pointer">
                  Cost Estimation
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-attachments"
                  checked={includeAttachments}
                  onCheckedChange={(checked) => setIncludeAttachments(checked as boolean)}
                />
                <Label htmlFor="include-attachments" className="font-normal cursor-pointer">
                  Photos & Attachments
                </Label>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isExporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <FileDown className="mr-2 h-4 w-4" />
                Export
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
