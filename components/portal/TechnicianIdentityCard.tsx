import {
  initialsFor,
  type PublicCertification,
} from "@/lib/portal/technician-identity";
import { clientPortalPanelPadding } from "@/lib/portal/client-portal-theme";

export interface TechnicianIdentity {
  name: string;
  photoUrl: string | null;
  bio: string | null;
  isVerified: boolean;
  certifications: PublicCertification[];
}

export function TechnicianIdentityCard({
  technician,
}: {
  technician: TechnicianIdentity;
}) {
  const { name, photoUrl, bio, isVerified, certifications } = technician;

  return (
    <section
      className={clientPortalPanelPadding}
      aria-labelledby="technician-heading"
    >
      <h2
        id="technician-heading"
        className="mb-3 text-sm font-semibold text-white/95"
      >
        Who is working on your property
      </h2>

      <div className="flex items-start gap-4">
        {photoUrl ? (
          // Plain <img>: this is a token-gated, non-indexed page, and
          // next/image would add an optimiser round trip plus a remotePatterns
          // entry per avatar host for one 64px picture.
          <img
            src={photoUrl}
            alt={`Photograph of ${name}`}
            className="h-16 w-16 rounded-full object-cover border border-slate-200"
            width={64}
            height={64}
          />
        ) : (
          <div
            className="h-16 w-16 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-lg font-semibold text-slate-500"
            aria-hidden="true"
          >
            {initialsFor(name)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-base font-medium text-white/95">{name}</p>
          {isVerified && (
            <p className="mt-0.5 text-xs text-emerald-400">
              Credentials verified by RestoreAssist
            </p>
          )}
          {bio && (
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{bio}</p>
          )}
        </div>
      </div>

      {certifications.length > 0 && (
        <div className="mt-4 border-t border-white/10 pt-3">
          <h3 className="mb-2 text-xs font-semibold text-slate-300">
            Current qualifications
          </h3>
          <ul className="space-y-2">
            {certifications.map((c) => (
              <li
                key={`${c.issuingBody}-${c.certificationName}`}
                className="text-sm"
              >
                <span className="text-slate-200">{c.certificationName}</span>
                <span className="text-slate-500"> &middot; {c.issuingBody}</span>
                {c.certificationNumber && (
                  <span className="block text-xs text-slate-500">
                    Registration {c.certificationNumber} &mdash; you can check
                    this with {c.issuingBody}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
