"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// Shown by a save that is refused while unreadable saved lines are pending.
export const UNREADABLE_LINES_BLOCK_SAVE =
  "A saved equipment line could not be read. Remove it from the job before saving.";

// RA-8281 B1 round 13 (review 8): a saved equipment line the one reader cannot
// read is never loaded into an editable list, so saving the list would delete
// it without a word and present the rest as the whole job. A screen that can
// save the list passes onRemove: it shows this notice and refuses to save
// until the user removes the line on purpose. A screen that only shows the
// saved list (it never writes it back) leaves onRemove out and gets the
// notice alone.
export function UnreadableEquipmentNotice({
  count,
  onRemove,
}: {
  count: number;
  onRemove?: () => void;
}) {
  if (count <= 0) return null;
  const lines = count === 1 ? "line" : "lines";
  return (
    <Alert variant="destructive">
      <AlertTitle>
        {count} saved equipment {lines} could not be read
      </AlertTitle>
      <AlertDescription>
        <p>
          {count === 1 ? "It is" : "They are"} still on this job but cannot be
          shown or priced, so the equipment list and total here are
          incomplete.
          {onRemove
            ? ` Saving is blocked until you remove the unreadable ${lines}.`
            : " This screen does not change the saved list."}
        </p>
        {onRemove && (
          <Button type="button" variant="outline" size="sm" onClick={onRemove}>
            Remove unreadable {lines}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
