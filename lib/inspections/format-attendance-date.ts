/**
 * Attendance date display — never substitute job `createdAt` for
 * `inspectionDate`. A null date means nobody recorded attendance yet.
 */

const EN_AU: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "short",
  year: "numeric",
};

const EN_AU_LONG: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "long",
  year: "numeric",
};

export function formatAttendanceDateEnAu(
  inspectionDate: string | Date | null | undefined,
): string | null {
  if (inspectionDate == null || inspectionDate === "") return null;
  const d =
    inspectionDate instanceof Date ? inspectionDate : new Date(inspectionDate);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-AU", EN_AU);
}

export function formatAttendanceDateEnAuLong(
  inspectionDate: string | Date | null | undefined,
): string | null {
  if (inspectionDate == null || inspectionDate === "") return null;
  const d =
    inspectionDate instanceof Date ? inspectionDate : new Date(inspectionDate);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-AU", EN_AU_LONG);
}

export const ATTENDANCE_NOT_RECORDED_LABEL = "Attendance not recorded";
