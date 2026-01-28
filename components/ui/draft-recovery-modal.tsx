"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Clock, AlertCircle, CheckCircle2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { draftStorage, type FormDraft } from "@/lib/form/auto-save";

interface DraftRecoveryModalProps {
  userId: string;
  onRestore: (draft: FormDraft) => void;
  onDiscard: () => void;
}

export function DraftRecoveryModal({ userId, onRestore, onDiscard }: DraftRecoveryModalProps) {
  const [drafts, setDrafts] = useState<FormDraft[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDraft, setSelectedDraft] = useState<FormDraft | null>(null);

  useEffect(() => {
    checkForDrafts();
  }, [userId]);

  const checkForDrafts = async () => {
    try {
      setIsLoading(true);
      const userDrafts = await draftStorage.getAllDrafts(userId);

      // Filter out drafts older than 7 days
      const recentDrafts = userDrafts.filter(draft => {
        const draftAge = Date.now() - draft.lastSaved;
        const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
        return draftAge < sevenDaysInMs;
      });

      if (recentDrafts.length > 0) {
        setDrafts(recentDrafts);
        setIsOpen(true);
        // Auto-select the most recent draft
        setSelectedDraft(recentDrafts[0]);
      }
    } catch (error) {
      console.error("Error checking for drafts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async () => {
    if (selectedDraft) {
      onRestore(selectedDraft);
      setIsOpen(false);
    }
  };

  const handleDiscardOne = async (draftId: string) => {
    try {
      await draftStorage.deleteDraft(draftId);
      const updatedDrafts = drafts.filter(d => d.id !== draftId);
      setDrafts(updatedDrafts);

      if (updatedDrafts.length === 0) {
        setIsOpen(false);
        onDiscard();
      } else {
        // Select the next draft
        setSelectedDraft(updatedDrafts[0]);
      }
    } catch (error) {
      console.error("Error discarding draft:", error);
    }
  };

  const handleDiscardAll = async () => {
    try {
      for (const draft of drafts) {
        await draftStorage.deleteDraft(draft.id);
      }
      setIsOpen(false);
      onDiscard();
    } catch (error) {
      console.error("Error discarding drafts:", error);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = now - timestamp;

    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;

    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const getCompletionPercentage = (draft: FormDraft): number => {
    const data = draft.data;
    let filledFields = 0;
    let totalFields = 10; // Approximate number of key fields

    if (data.clientName) filledFields++;
    if (data.propertyAddress) filledFields++;
    if (data.propertyPostcode) filledFields++;
    if (data.technicianFieldReport) filledFields++;
    if (data.claimReferenceNumber) filledFields++;
    if (data.incidentDate) filledFields++;
    if (data.technicianAttendanceDate) filledFields++;
    if (data.technicianName) filledFields++;
    if (data.areas && data.areas.length > 0) filledFields++;
    if (data.equipmentSelections && data.equipmentSelections.length > 0) filledFields++;

    return Math.round((filledFields / totalFields) * 100);
  };

  if (!isOpen || drafts.length === 0) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Clock className="w-6 h-6 text-cyan-500" />
            Recover Unsaved Work
          </DialogTitle>
          <DialogDescription className="text-base">
            {drafts.length === 1
              ? "We found an unsaved draft from a previous session."
              : `We found ${drafts.length} unsaved drafts from previous sessions.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {drafts.map((draft) => {
            const completion = getCompletionPercentage(draft);
            const isSelected = selectedDraft?.id === draft.id;

            return (
              <div
                key={draft.id}
                onClick={() => setSelectedDraft(draft)}
                className={cn(
                  "p-4 rounded-lg border-2 cursor-pointer transition-all",
                  isSelected
                    ? "border-cyan-500 bg-cyan-500/5"
                    : "border-neutral-200 dark:border-neutral-800 hover:border-cyan-500/50"
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {isSelected && (
                        <CheckCircle2 className="w-5 h-5 text-cyan-500" />
                      )}
                      <h3 className={cn(
                        "font-semibold",
                        isSelected ? "text-cyan-600 dark:text-cyan-400" : "text-neutral-900 dark:text-neutral-50"
                      )}>
                        {draft.data.clientName || "Unnamed Report"}
                      </h3>
                    </div>

                    <div className="space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
                      {draft.data.propertyAddress && (
                        <p>📍 {draft.data.propertyAddress}</p>
                      )}
                      <p className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Last saved: {formatTimestamp(draft.lastSaved)}
                      </p>
                    </div>

                    {/* Progress indicator */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-neutral-600 dark:text-neutral-400">
                          Form completion
                        </span>
                        <span className="font-semibold text-neutral-900 dark:text-neutral-50">
                          {completion}%
                        </span>
                      </div>
                      <div className="h-2 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all"
                          style={{ width: `${completion}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Discard button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDiscardOne(draft.id);
                    }}
                    className="ml-4 p-2 text-neutral-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors"
                    title="Discard this draft"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Warning message */}
        <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-900 dark:text-amber-200 mb-1">
              Choose carefully
            </p>
            <p className="text-amber-800 dark:text-amber-300">
              Restoring a draft will replace any data you've entered in the current form.
              Discarded drafts cannot be recovered.
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-between gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <button
            onClick={handleDiscardAll}
            className="px-4 py-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-50 transition-colors"
          >
            Discard All Drafts
          </button>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setIsOpen(false);
                onDiscard();
              }}
              className="px-6 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              Start Fresh
            </button>
            <button
              onClick={handleRestore}
              disabled={!selectedDraft}
              className={cn(
                "px-6 py-2 rounded-lg font-medium transition-all",
                "bg-gradient-to-r from-blue-500 to-cyan-500 text-white",
                "hover:shadow-lg hover:shadow-cyan-500/50",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              Restore Selected Draft
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
