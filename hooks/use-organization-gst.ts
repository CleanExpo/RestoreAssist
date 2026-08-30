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
} {
  const [treatment, setTreatment] = useState<GstTreatment>(DEFAULT_GST_TREATMENT);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/gst-treatment")
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        const country = result?.data?.country;
        if (country === "AU" || country === "NZ") {
          setTreatment(getGstTreatment(country));
        }
      })
      .finally(() => setReady(true));
  }, []);

  return { treatment, ready };
}
