import {
  initialsFor,
  type PublicCertification,
} from "@/lib/portal/technician-identity";

export interface TechnicianIdentity {
  name: string;
  photoUrl: string | null;
  bio: string | null;
  isVerified: boolean;
  certifications: PublicCertification[];
}

/**
 * "Who is in your home" — shown to the client on their portal.
 *
 * The portal already showed a bare technician NAME. That tells a homeowner
 * almost nothing when a stranger is standing at the door, which is the moment
 * this card is for. Photo, a short bio in the technician's own words, and the
 * credentials they actually hold — with the numbers a client can check on the
 * issuing body's register.
 *
 * Everything here has already been filtered by selectPublicCertifications():
 * unverified and lapsed credentials never reach this component, and insurance
 * policy numbers are redacted upstream. This renders; it does not decide.
 */
export function TechnicianIdentityCard({
  technician,
}: {
  technician: TechnicianIdentity;
}) {
  const { name, photoUrl, bio, isVerified, certifications } = technician;

  return (
    <section
      className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5"
      aria-labelledby="technician-heading"
    >
      <h2
        id="technician-heading"
        className="text-sm font-semibold text-slate-900 mb-3"
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
          <p className="text-base font-medium text-slate-900">{name}</p>
          {isVerified && (
            <p className="text-xs text-emerald-700 mt-0.5">
              Credentials verified by RestoreAssist
            </p>
          )}
          {bio && (
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">{bio}</p>
          )}
        </div>
      </div>

      {certifications.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <h3 className="text-xs font-semibold text-slate-700 mb-2">
            Current qualifications
          </h3>
          <ul className="space-y-2">
            {certifications.map((c) => (
              <li
                key={`${c.issuingBody}-${c.certificationName}`}
                className="text-sm"
              >
                <span className="text-slate-800">{c.certificationName}</span>
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
