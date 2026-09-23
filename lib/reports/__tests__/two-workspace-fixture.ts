// RA-7727 test fixture: two workspaces (Organizations), each with an owner, and
// a technician in workspace A. Rows are returned ONLY along the path the query
// actually selects, so a query that drops the organisation scope gets no owner
// back — the mock cannot hand over a row the real query would not reach.

type Row = Record<string, unknown>;

const CERT = {
  certificationType: "IICRC",
  certificationName: "Water Damage Restoration Technician",
  issuingBody: "IICRC",
  certificationNumber: "WRT-1001",
  expiryDate: new Date("2099-01-01T00:00:00Z"),
  verificationStatus: "VERIFIED",
};

const PROFILES: Record<string, Row> = {
  "owner-a": {
    publicDescription: "Harbour Restorations: family-run water damage specialists.",
    isPubliclyVisible: true,
    isVerified: true,
    certifications: [CERT],
  },
  "owner-b": {
    publicDescription: "Rival Restorations: the OTHER tenant.",
    isPubliclyVisible: true,
    isVerified: true,
    certifications: [{ ...CERT, certificationNumber: "WRT-9999" }],
  },
};

const USERS: Record<string, Row> = {
  "owner-a": {
    id: "owner-a",
    role: "ADMIN",
    name: "Olive Owner",
    image: "https://img.example/olive.jpg",
    organizationId: "org-a",
    businessName: "Harbour Restorations",
    businessAddress: "1 Harbour St",
    businessLogo: "https://img.example/harbour-logo.png",
    businessABN: "11 111 111 111",
    businessPhone: "0400 000 001",
    businessEmail: "office@harbour.example",
  },
  "tech-a": {
    id: "tech-a",
    role: "USER",
    name: "Tess Tech",
    image: "https://img.example/tess.jpg",
    organizationId: "org-a",
    businessName: null,
    businessAddress: null,
    businessLogo: null,
    businessABN: null,
    businessPhone: null,
    businessEmail: null,
  },
  "owner-b": {
    id: "owner-b",
    role: "ADMIN",
    name: "Rex Rival",
    image: "https://img.example/rex.jpg",
    organizationId: "org-b",
    businessName: "Rival Restorations",
    businessAddress: "9 Rival Rd",
    businessLogo: "https://img.example/rival-logo.png",
    businessABN: "99 999 999 999",
    businessPhone: "0400 000 009",
    businessEmail: "office@rival.example",
  },
};

const ORGS: Record<string, Row> = {
  "org-a": { id: "org-a", name: "Harbour Restorations Pty Ltd", ownerId: "owner-a" },
  "org-b": { id: "org-b", name: "Rival Restorations Pty Ltd", ownerId: "owner-b" },
};

export interface FixtureOverrides {
  users?: Record<string, Row>;
  profiles?: Record<string, Row | null>;
}

export function makeTwoWorkspaces(overrides: FixtureOverrides = {}) {
  const users: Record<string, Row> = {};
  for (const [id, row] of Object.entries(USERS)) {
    users[id] = { ...row, ...(overrides.users?.[id] ?? {}) };
  }
  const profiles: Record<string, Row | null> = {
    ...PROFILES,
    ...(overrides.profiles ?? {}),
  };

  function orgRow(orgId: unknown): Row | null {
    if (typeof orgId !== "string" || !ORGS[orgId]) return null;
    const org = ORGS[orgId];
    return {
      ...org,
      get owner() {
        return userRow(org.ownerId as string);
      },
    };
  }

  function userRow(id: string): Row | null {
    const u = users[id];
    if (!u) return null;
    return {
      ...u,
      get organization() {
        return orgRow(u.organizationId);
      },
      get contractorProfile() {
        return profiles[id] ?? null;
      },
    };
  }

  return { userRow, users };
}

/** Return only the fields a Prisma `select` asks for, following nested selects. */
export function project(row: unknown, select: Record<string, unknown>): unknown {
  if (row == null) return null;
  if (Array.isArray(row)) return row.map((r) => project(r, select));
  const src = row as Row;
  const out: Row = {};
  for (const [key, spec] of Object.entries(select)) {
    if (spec === true) {
      out[key] = src[key] ?? null;
    } else if (spec && typeof spec === "object" && "select" in spec) {
      out[key] = project(
        src[key],
        (spec as { select: Record<string, unknown> }).select,
      );
    }
  }
  return out;
}
