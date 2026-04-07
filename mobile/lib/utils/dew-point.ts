/**
 * Magnus formula dew point calculation.
 * Input: temperature in °C, relative humidity in %.
 * Returns dew point in °C rounded to 1 decimal.
 */
export function calculateDewPoint(tempC: number, humidityPct: number): number {
  const a = 17.27;
  const b = 237.7;
  const alpha = (a * tempC) / (b + tempC) + Math.log(humidityPct / 100);
  const dewPoint = (b * alpha) / (a - alpha);
  return Math.round(dewPoint * 10) / 10;
}
