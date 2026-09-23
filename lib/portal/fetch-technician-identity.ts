import { prisma } from "@/lib/prisma";
import { getOrganizationOwner } from "@/lib/organization-credits";
import { selectPublicCertifications } from "@/lib/portal/technician-identity";
import type { TechnicianIdentity } from "@/components/portal/TechnicianIdentityCard";

/**
 * Load what the client may see about the technician on their job.
 *
 * Returns null — and the portal then falls back to the bare name it has always
 * shown — whenever any of these hold:
 *
 *   - the workspace owner of the job cannot be resolved,
 *   - the owner has no ContractorProfile,
 *   - the profile is `isPubliclyVisible: false`,
 *   - someone other than the owner attends and no business name is saved.
 *
 * A job with no `technicianId` (many carry only a free-text `technicianName`)
 * is shown under the business, like any job the owner is not attending.
 *
 * THAT LAST ONE IS A DELIBERATE CHOICE. The flag exists for the public
 * contractor directory, and this portal is a different context: token-gated, and
 * shown to the one client whose home the technician is standing in. It would be
 * defensible to ignore it here. But someone who set it has expressed a
 * preference not to have their photo and biography published, and honouring that
 * costs the client only the extra detail — the technician's NAME is still shown,
 * exactly as before, so nobody is left wondering who is at the door.
 */
export async function fetchTechnicianIdentity(
  technicianId: string | null,
  fallbackName: string | null,
  jobUserId: string,
): Promise<TechnicianIdentity | null> {
  // RA-7727: the profile shown is the WORKSPACE OWNER's — only the owner can
  // save one (app/api/contractors/profile/route.ts), so reading the
  // technician's own profile showed the card only on jobs the owner attended.
  //
  // TENANCY: the owner is resolved from the user who owns the job
  // (Inspection.userId) through getOrganizationOwner, never from technicianId.
  // A technician link to someone outside the workspace — including another
  // workspace's owner, who has a profile of their own — is never read.
  const ownerId = await getOrganizationOwner(jobUserId);
  if (!ownerId) return null;

  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: {
      name: true,
      image: true,
      businessName: true,
      businessLogo: true,
      contractorProfile: {
        select: {
          publicDescription: true,
          isPubliclyVisible: true,
          isVerified: true,
          certifications: {
            select: {
              certificationType: true,
              certificationName: true,
              issuingBody: true,
              certificationNumber: true,
              expiryDate: true,
              verificationStatus: true,
            },
          },
        },
      },
    },
  });

  const profile = owner?.contractorProfile;
  if (!owner || !profile || !profile.isPubliclyVisible) return null;

  // The owner at the door is shown as themselves, exactly as before. Anyone
  // else attending is shown under the BUSINESS: its name and logo, never the
  // owner's personal name or photo, which would tell the client the wrong
  // person is in their home.
  const ownerAttending = technicianId === ownerId;
  const name = ownerAttending
    ? (owner.name ?? fallbackName)
    : owner.businessName;
  if (!name) return null;

  return {
    name,
    photoUrl: ownerAttending ? owner.image : owner.businessLogo,
    bio: profile.publicDescription,
    isVerified: profile.isVerified,
    certifications: selectPublicCertifications(profile.certifications),
  };
}
