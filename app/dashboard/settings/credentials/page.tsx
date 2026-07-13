"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { EngagementLicenceModal } from "@/components/attestation/EngagementLicenceModal";

export default function CredentialsPage() {
  const router = useRouter();
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setOpen(true);
  }, [searchParams]);

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <h1 className="text-xl font-semibold mb-4">Your credentials</h1>
      <p className="text-sm text-muted-foreground mb-6">
        IICRC certificate, WHS White Card, and state licence are verified at every attestation moment per rule 28. You can pre-fill them here.
      </p>
      <EngagementLicenceModal
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) router.push("/dashboard");
        }}
        inspectionId={null}
        onConfirmed={() => {
          setOpen(false);
          router.push("/dashboard");
        }}
      />
    </div>
  );
}
