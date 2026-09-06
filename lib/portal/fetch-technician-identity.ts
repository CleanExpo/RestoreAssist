import { prisma } from "@/lib/prisma";
import { selectPublicCertifications } from "@/lib/portal/technician-identity";
import type { TechnicianIdentity } from "@/components/portal/TechnicianIdentityCard";

/**
 * Load what the client may see about the technician on their job.
 *
 * Returns null — and the portal then falls back to the bare name it has always
 * shown — whenever any of these hold:
 *
 *   - the inspection has no `technicianId` (the field is nullable; many jobs
 *     carry only a free-text `technicianName`),
 *   - the technician has no ContractorProfile,
 *   - the profile is `isPubliclyVisible: false`.
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
): Promise<TechnicianIdentity | null> {
  if (!technicianId) return null;

  const user = await prisma.user.findUnique({
    where: { id: technicianId },
    select: {
      name: true,
      image: true,
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

  const profile = user?.contractorProfile;
  if (!user || !profile || !profile.isPubliclyVisible) return null;

  const name = user.name ?? fallbackName;
  if (!name) return null;

  return {
    name,
    photoUrl: user.image,
    bio: profile.publicDescription,
    isVerified: profile.isVerified,
    certifications: selectPublicCertifications(profile.certifications),
  };
}
