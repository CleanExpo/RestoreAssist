"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_GST_TREATMENT,
  getGstTreatment,
  type GstTreatment,
} from "@/lib/gst-rules";

export function useOrganizationGst(): {
  treatment: GstTreatment;
  ready: boolean;
  /**
   * True when the tenant's treatment could not be resolved, so `treatment`
   * is still the AU default rather than the tenant's own rate (RA-7725).
   */
  failed: boolean;
} {
  const [treatment, setTreatment] = useState<GstTreatment>(DEFAULT_GST_TREATMENT);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/gst-treatment")
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        const country = result?.data?.country;
        if (country === "AU" || country === "NZ") {
          setTreatment(getGstTreatment(country));
        } else {
          setFailed(true);
        }
      })
      .catch(() => setFailed(true))
      .finally(() => setReady(true));
  }, []);

  return { treatment, ready, failed };
}
