import { prisma } from "@/lib/prisma";

/**
 * Seeds one sample Client and one sample Report for a newly-registered user.
 * Gives TRIAL users something to click on instead of an empty dashboard.
 * Marked with isSample=true so the user can clear them in one click.
 *
 * Call site: app/api/auth/register/route.ts — fire-and-forget after user
 * creation. Never throws; a seed failure must not block registration.
 *
 * RA-1239.
 */
export async function seedDemoDataForNewUser(userId: string): Promise<void> {
  try {
    const existing = await prisma.client.findFirst({
      where: { userId, isSample: true },
      select: { id: true },
    });
    if (existing) return; // Already seeded

    const client = await prisma.client.create({
      data: {
        userId,
        name: "Sample — Mrs Jane Smith",
        email: "sample.client@example.com.au",
        phone: "0400 000 000",
        address: "42 Example Street, Sydney NSW 2000",
        company: "",
        contactPerson: "Jane Smith",
        notes:
          "This is a sample client so you can see how RestoreAssist works. Safe to delete from the Clients page anytime.",
        status: "ACTIVE",
        isSample: true,
      },
    });

    await prisma.report.create({
      data: {
        userId,
        clientId: client.id,
        title: "Sample — Water Damage, Kitchen Supply Line Burst",
        description:
          "A demo report to help you explore RestoreAssist. It walks through the AS-IICRC S500:2025 stabilisation pathway for a Category 1 water event affecting a single room. Delete from the Reports page when you're ready to start your first real job.",
        status: "DRAFT",
        clientName: "Sample — Mrs Jane Smith",
        propertyAddress: "42 Example Street, Sydney NSW 2000",
        hazardType: "WATER_DAMAGE",
        insuranceType: "Building",
        totalCost: 4850.0,
        isSample: true,
      },
    });
  } catch (err) {
    // Never block registration on seed failure — just log and move on.
    console.error("[demo-data] seedDemoDataForNewUser failed:", err);
  }
}
