"use client";

import { cn } from "@/lib/utils";
import type { EquipmentSelection } from "@/lib/equipment-matrix";
import {
  ArrowRight,
  Droplets,
  FileText,
  MapPin,
  User,
  Wrench,
} from "lucide-react";
import type { FormData, NirMoistureReading, NirAffectedArea } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ReviewSectionProps {
  formData: FormData;
  nirMoistureReadings: NirMoistureReading[];
  nirAffectedAreas: NirAffectedArea[];
  equipmentSelections: EquipmentSelection[];
  onBackToEdit: () => void;
  onContinueToReportType: () => void;
}

export function ReviewSection({
  formData,
  nirMoistureReadings,
  nirAffectedAreas,
  equipmentSelections,
  onBackToEdit,
  onContinueToReportType,
}: ReviewSectionProps) {
  return (
    <div
      className={cn(
        "p-6 rounded-lg border-2 space-y-6 mt-6",
        "border-cyan-500/50 dark:border-cyan-500/50",
        "bg-cyan-500/10 dark:bg-cyan-500/10",
      )}
    >
      <div className="mb-6">
        <h2
          className={cn(
            "text-2xl font-semibold mb-2 flex items-center gap-2",
            "text-neutral-900 dark:text-neutral-50",
          )}
        >
          <FileText className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          Review All Data
        </h2>
        <p className={cn("text-neutral-600 dark:text-neutral-400")}>
          Please review all entered data before proceeding to report type
          selection and PDF generation.
        </p>
      </div>

      {/* Client Information */}
      <div
        className={cn(
          "p-6 rounded-lg border",
          "bg-white dark:bg-neutral-900/50",
          "border-neutral-200 dark:border-neutral-700",
        )}
      >
        <h3
          className={cn(
            "text-lg font-semibold mb-4 flex items-center gap-2",
            "text-neutral-900 dark:text-neutral-50",
          )}
        >
          <User className="w-5 h-5" />
          Client Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className={cn("text-neutral-600 dark:text-neutral-400")}>
              Client Name:
            </span>
            <p
              className={cn(
                "font-medium",
                "text-neutral-900 dark:text-neutral-50",
              )}
            >
              {formData.clientName || "\u2014"}
            </p>
          </div>
          <div>
            <span className={cn("text-neutral-600 dark:text-neutral-400")}>
              Contact Details:
            </span>
            <p
              className={cn(
                "font-medium",
                "text-neutral-900 dark:text-neutral-50",
              )}
            >
              {formData.clientContactDetails || "\u2014"}
            </p>
          </div>
        </div>
      </div>

      {/* Property Information */}
      <div
        className={cn(
          "p-6 rounded-lg border",
          "bg-white dark:bg-neutral-900/50",
          "border-neutral-200 dark:border-neutral-700",
        )}
      >
        <h3
          className={cn(
            "text-lg font-semibold mb-4 flex items-center gap-2",
            "text-neutral-900 dark:text-neutral-50",
          )}
        >
          <MapPin className="w-5 h-5" />
          Property Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className={cn("text-neutral-600 dark:text-neutral-400")}>
              Address:
            </span>
            <p
              className={cn(
                "font-medium",
                "text-neutral-900 dark:text-neutral-50",
              )}
            >
              {formData.propertyAddress || "\u2014"}
            </p>
          </div>
          <div>
            <span className={cn("text-neutral-600 dark:text-neutral-400")}>
              Postcode:
            </span>
            <p
              className={cn(
                "font-medium",
                "text-neutral-900 dark:text-neutral-50",
              )}
            >
              {formData.propertyPostcode || "\u2014"}
            </p>
          </div>
          {formData.buildingAge && (
            <div>
              <span className={cn("text-neutral-600 dark:text-neutral-400")}>
                Building Age:
              </span>
              <p
                className={cn(
                  "font-medium",
                  "text-neutral-900 dark:text-neutral-50",
                )}
              >
                {formData.buildingAge}
              </p>
            </div>
          )}
          {formData.structureType && (
            <div>
              <span className={cn("text-neutral-600 dark:text-neutral-400")}>
                Structure Type:
              </span>
              <p
                className={cn(
                  "font-medium",
                  "text-neutral-900 dark:text-neutral-50",
                )}
              >
                {formData.structureType}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Claim Information */}
      <div
        className={cn(
          "p-6 rounded-lg border",
          "bg-white dark:bg-neutral-900/50",
          "border-neutral-200 dark:border-neutral-700",
        )}
      >
        <h3
          className={cn(
            "text-lg font-semibold mb-4 flex items-center gap-2",
            "text-neutral-900 dark:text-neutral-50",
          )}
        >
          <FileText className="w-5 h-5" />
          Claim Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {formData.claimReferenceNumber && (
            <div>
              <span className={cn("text-neutral-600 dark:text-neutral-400")}>
                Claim Reference:
              </span>
              <p
                className={cn(
                  "font-medium",
                  "text-neutral-900 dark:text-neutral-50",
                )}
              >
                {formData.claimReferenceNumber}
              </p>
            </div>
          )}
          {formData.incidentDate && (
            <div>
              <span className={cn("text-neutral-600 dark:text-neutral-400")}>
                Incident Date:
              </span>
              <p
                className={cn(
                  "font-medium",
                  "text-neutral-900 dark:text-neutral-50",
                )}
              >
                {formData.incidentDate}
              </p>
            </div>
          )}
          {formData.technicianName && (
            <div>
              <span className={cn("text-neutral-600 dark:text-neutral-400")}>
                Technician:
              </span>
              <p
                className={cn(
                  "font-medium",
                  "text-neutral-900 dark:text-neutral-50",
                )}
              >
                {formData.technicianName}
              </p>
            </div>
          )}
          {formData.technicianAttendanceDate && (
            <div>
              <span className={cn("text-neutral-600 dark:text-neutral-400")}>
                Attendance Date:
              </span>
              <p
                className={cn(
                  "font-medium",
                  "text-neutral-900 dark:text-neutral-50",
                )}
              >
                {formData.technicianAttendanceDate}
              </p>
            </div>
          )}
        </div>
        {formData.technicianFieldReport && (
          <div className="mt-4">
            <span className={cn("text-neutral-600 dark:text-neutral-400")}>
              Field Report:
            </span>
            <p
              className={cn(
                "mt-1 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800",
                "text-neutral-900 dark:text-neutral-50",
              )}
            >
              {formData.technicianFieldReport}
            </p>
          </div>
        )}
      </div>

      {/* NIR Data - Moisture Readings */}
      {nirMoistureReadings.length > 0 && (
        <div
          className={cn(
            "p-6 rounded-lg border",
            "bg-white dark:bg-neutral-900/50",
            "border-neutral-200 dark:border-neutral-700",
          )}
        >
          <h3
            className={cn(
              "text-lg font-semibold mb-4 flex items-center gap-2",
              "text-neutral-900 dark:text-neutral-50",
            )}
          >
            <Droplets className="w-5 h-5" />
            Moisture Readings ({nirMoistureReadings.length})
          </h3>
          <div className="space-y-2">
            {nirMoistureReadings.map((reading) => (
              <div
                key={reading.id}
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg",
                  "bg-neutral-50 dark:bg-neutral-800",
                )}
              >
                <div className="flex items-center gap-4 text-sm">
                  <span
                    className={cn(
                      "font-medium",
                      "text-neutral-900 dark:text-neutral-50",
                    )}
                  >
                    {reading.location}
                  </span>
                  <span
                    className={cn("text-neutral-600 dark:text-neutral-400")}
                  >
                    {reading.surfaceType}
                  </span>
                  <span
                    className={cn(
                      "font-semibold text-cyan-600 dark:text-cyan-400",
                    )}
                  >
                    {reading.moistureLevel}%
                  </span>
                  <span
                    className={cn("text-neutral-600 dark:text-neutral-400")}
                  >
                    {reading.depth}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* NIR Data - Affected Areas */}
      {nirAffectedAreas.length > 0 && (
        <div
          className={cn(
            "p-6 rounded-lg border",
            "bg-white dark:bg-neutral-900/50",
            "border-neutral-200 dark:border-neutral-700",
          )}
        >
          <h3
            className={cn(
              "text-lg font-semibold mb-4 flex items-center gap-2",
              "text-neutral-900 dark:text-neutral-50",
            )}
          >
            <MapPin className="w-5 h-5" />
            Affected Areas ({nirAffectedAreas.length})
          </h3>
          <div className="space-y-3">
            {nirAffectedAreas.map((area) => (
              <div
                key={area.id}
                className={cn(
                  "p-4 rounded-lg",
                  "bg-neutral-50 dark:bg-neutral-800",
                )}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className={cn(
                      "font-medium text-base",
                      "text-neutral-900 dark:text-neutral-50",
                    )}
                  >
                    {area.roomZoneId}
                  </span>
                  <span
                    className={cn(
                      "text-xs px-2 py-1 bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 rounded",
                    )}
                  >
                    {area.affectedSquareFootage.toFixed(2)} m&sup2;
                  </span>
                </div>
                {area.materials && area.materials.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap text-xs mt-2">
                    <span
                      className={cn("text-neutral-600 dark:text-neutral-400")}
                    >
                      Materials:
                    </span>
                    {area.materials.map((material: string, idx: number) => (
                      <span
                        key={idx}
                        className={cn(
                          "px-2 py-0.5 rounded",
                          "bg-neutral-200 dark:bg-neutral-700",
                          "text-neutral-900 dark:text-neutral-50",
                        )}
                      >
                        {material}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Equipment Selection */}
      {equipmentSelections.length > 0 && (
        <div
          className={cn(
            "p-6 rounded-lg border",
            "bg-white dark:bg-neutral-900/50",
            "border-neutral-200 dark:border-neutral-700",
          )}
        >
          <h3
            className={cn(
              "text-lg font-semibold mb-4 flex items-center gap-2",
              "text-neutral-900 dark:text-neutral-50",
            )}
          >
            <Wrench className="w-5 h-5" />
            Equipment Selection ({equipmentSelections.length})
          </h3>
          <div className="space-y-2">
            {equipmentSelections.map((eq: any) => (
              <div
                key={eq.id || eq.groupId}
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg",
                  "bg-neutral-50 dark:bg-neutral-800",
                )}
              >
                <span
                  className={cn(
                    "text-sm",
                    "text-neutral-900 dark:text-neutral-50",
                  )}
                >
                  {eq.quantity}x {eq.type || eq.groupId}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end gap-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
        <button
          type="button"
          onClick={onBackToEdit}
          className={cn(
            "px-6 py-2 rounded-lg border transition-all",
            "border-neutral-300 dark:border-neutral-700",
            "bg-white dark:bg-neutral-800",
            "hover:bg-neutral-50 dark:hover:bg-neutral-700",
            "text-neutral-900 dark:text-neutral-50",
          )}
        >
          Back to Edit
        </button>
        <button
          type="button"
          onClick={onContinueToReportType}
          className={cn(
            "px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2",
            "bg-gradient-to-r from-blue-500 to-cyan-500",
            "hover:from-blue-600 hover:to-cyan-600",
            "text-white shadow-lg hover:shadow-xl",
          )}
        >
          <span>Continue to Report Type Selection</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
