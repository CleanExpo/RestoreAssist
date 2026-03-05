/**
 * Converts interview auto-populated fields to inspection NIR form prefill shape.
 * Used when saving interview completion and when loading prefill from DB.
 */

export interface InterviewPopulatedFieldLike {
  value: unknown
  confidence?: number
}

/** Field ID mapping: question-library / interview IDs -> inspection form keys */
const FIELD_MAPPING: Record<string, string> = {
  sourceOfWater: 'sourceOfWater',
  waterCategory: 'waterCategory',
  waterClass: 'waterClass',
  propertyAddress: 'propertyAddress',
  propertyPostcode: 'propertyPostcode',
  clientName: 'clientName',
  clientContactDetails: 'clientContactDetails',
  incidentDate: 'incidentDate',
  technicianAttendanceDate: 'technicianAttendanceDate',
  technicianName: 'technicianName',
  affectedArea: 'affectedArea',
  affectedAreaPercentage: 'affectedArea',
  claimReferenceNumber: 'claimReferenceNumber',
  buildingAge: 'buildingAge',
  structureType: 'structureType',
  hazardType: 'hazardType',
  insuranceType: 'insuranceType',
  temperatureCurrent: 'ambientTemperature',
  humidityCurrent: 'humidityLevel',
  timeSinceLoss: 'timeSinceLoss',
}

/**
 * Convert interview auto-populated fields (object from DB or Map) to flat object for inspection prefill.
 * Handles both { fieldId: { value, confidence } } and Map<string, { value, confidence }>.
 */
export function interviewFieldsToInspectionPrefill(
  fields: Record<string, InterviewPopulatedFieldLike> | Map<string, InterviewPopulatedFieldLike>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const entries = fields instanceof Map ? Array.from(fields.entries()) : Object.entries(fields)

  for (const [fieldId, field] of entries) {
    if (field == null || typeof field !== 'object' || !('value' in field)) continue
    const reportFieldName = FIELD_MAPPING[fieldId] ?? fieldId
    const value = (field as { value: unknown }).value

    if (reportFieldName.includes('Date') && value) {
      try {
        const date = new Date(value as string | number | Date)
        if (!Number.isNaN(date.getTime())) {
          result[reportFieldName] = date.toISOString().split('T')[0]
        } else {
          result[reportFieldName] = value
        }
      } catch {
        result[reportFieldName] = value
      }
    } else {
      result[reportFieldName] = value
    }
  }

  return result
}
