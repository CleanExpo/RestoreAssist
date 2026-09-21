import { CLIENT_PORTAL_VIDEOS, type ClientVideo } from "@/lib/portal/client-videos";
import { PORTAL_PATHS } from "@/lib/portal/recovery-paths";

export const CLIENT_HELP_TOPICS = [
  "access",
  "reports",
  "approvals",
  "invoices",
  "support",
] as const;

export type ClientHelpTopic = (typeof CLIENT_HELP_TOPICS)[number];

export type ClientHelpArticle = {
  slug: string;
  title: string;
  summary: string;
  topics: ClientHelpTopic[];
  sections: Array<{ heading: string; body: string }>;
  relatedVideoIds: string[];
};

export const CLIENT_HELP_ARTICLES: ClientHelpArticle[] = [
  {
    slug: "access-and-recovery",
    title: "Job links, portal accounts, and expired access",
    summary:
      "How a job link differs from a portal account, when each expires, and how to request a new invite.",
    topics: ["access", "support"],
    relatedVideoIds: ["evidence-chain"],
    sections: [
      {
        heading: "Job link",
        body: "A job link looks like a long address under /portal/ and opens one job without a password. The link itself is the key. Job links expire after a set time, or when the contractor replaces them. If the page says the link has expired, do not try a contractor login — request a new invite or ask the contractor for a fresh job link.",
      },
      {
        heading: "Portal account",
        body: "A portal account is an email and password created from an invitation. After sign-in, the report list at /portal shows every report for that property. Invitations expire if they are not accepted in time. An expired invitation is not a contractor-dashboard problem.",
      },
      {
        heading: "What expires, and what to do",
        body: "Job links and unused invitations both expire. A portal account that was already created does not vanish when a job link expires — sign in at the client portal login. Password reset is not self-serve. The recovery path is a new invitation from the contractor, which can be requested from the client recovery page.",
      },
      {
        heading: "Request a new invite",
        body: "Use the client recovery form with the same email the contractor used. If a matching invitation exists, a new link is sent. If nothing arrives, ask the restoration contractor to resend from their side. Stay on /portal/recovery — never a contractor sign-in screen.",
      },
    ],
  },
  {
    slug: "reports",
    title: "Reading restoration reports",
    summary:
      "Where reports appear on a job link and on a portal account, and what a missing report means.",
    topics: ["reports"],
    relatedVideoIds: ["drying-standard", "moisture-mapping"],
    sections: [
      {
        heading: "On a job link",
        body: "The job page shows live status, affected rooms, and a notice when a report is ready. It does not open the contractor report workshop. Photos and notes uploaded here go to the contractor for review.",
      },
      {
        heading: "On a portal account",
        body: "Signed-in reports sit on the client report list. Open a report to read the summary, download a PDF when the contractor has issued one, and respond to any waiting approvals.",
      },
      {
        heading: "When the list is empty",
        body: "An empty report list is not a broken login. Reports appear after the contractor publishes them. If a job link was emailed, that link still opens the job. If both are empty, request a new invite or ask the contractor whether the report is ready.",
      },
    ],
  },
  {
    slug: "approvals",
    title: "Approving scope and authorities",
    summary:
      "How to sign authorities on a job link and approve scope or cost on a portal account.",
    topics: ["approvals"],
    relatedVideoIds: ["evidence-chain"],
    sections: [
      {
        heading: "Authorities on a job link",
        body: "Some jobs ask for signed authorities on the job page itself — permission to enter, or to start work. Those forms appear only when something is waiting. They are not the contractor's internal checklist.",
      },
      {
        heading: "Approvals on a portal account",
        body: "A signed-in report can ask for approval of the scope of works or a cost estimate. Open the report, read the request, then approve or decline with a comment. That action stays on the client report — it does not open a contractor dashboard.",
      },
      {
        heading: "If nothing is waiting",
        body: "Hidden or empty approval sections mean there is nothing to sign yet. Check again after the contractor sends an update, or use the support article if access itself failed.",
      },
    ],
  },
  {
    slug: "invoices",
    title: "Invoices sent to the client",
    summary:
      "Invoice links are separate from the job page and from contractor billing.",
    topics: ["invoices"],
    relatedVideoIds: [],
    sections: [
      {
        heading: "Where invoices arrive",
        body: "Invoices are sent as their own link, usually by email from the restoration contractor. That page shows the invoice and payment options the contractor enabled. It is not the contractor billing or subscription screen.",
      },
      {
        heading: "Job page versus invoice link",
        body: "A job link tracks the restoration. An invoice link is a document the contractor chose to share. Opening one does not replace the other. If an invoice link has expired, ask the contractor to send the invoice again — do not use contractor help or a contractor login.",
      },
      {
        heading: "Questions about an amount",
        body: "Amounts, GST, and payment terms come from the contractor. Use the contact details on the invoice or job page. Client help here only explains how to open the document, not how the contractor prices the work.",
      },
    ],
  },
  {
    slug: "support",
    title: "Get help on a job",
    summary:
      "Who to contact for the job, and how to recover access without leaving the client portal.",
    topics: ["support", "access"],
    relatedVideoIds: ["water-damage-categories"],
    sections: [
      {
        heading: "Job questions",
        body: "Questions about drying, attendance, or what happens next go to the restoration contractor named on the job. The technician name on the job page is the first contact.",
      },
      {
        heading: "Access problems",
        body: "Expired job links and unused invitations are recovered on the client recovery page, or by asking the contractor to resend. A portal account that already exists can sign in on the client login page. Contractor sign-in and contractor help are the wrong door.",
      },
      {
        heading: "What this help is not",
        body: "These articles are for the person whose property is being restored. They do not cover inspections, team invites, Xero, or subscription billing. Those belong to the contractor product, which this portal does not open.",
      },
    ],
  },
];

export function getClientHelpArticle(slug: string): ClientHelpArticle | undefined {
  return CLIENT_HELP_ARTICLES.find((article) => article.slug === slug);
}

export function videosForArticle(article: ClientHelpArticle): ClientVideo[] {
  if (article.relatedVideoIds.length === 0) return [];
  const byId = new Map(CLIENT_PORTAL_VIDEOS.map((video) => [video.id, video]));
  return article.relatedVideoIds
    .map((id) => byId.get(id))
    .filter((video): video is ClientVideo => video != null);
}

export const CLIENT_HELP_INDEX_INTRO =
  "Plain-language help for people using a job link or a client portal account. It does not cover contractor tools.";

export function clientHelpHref(slug?: string): string {
  return slug ? `${PORTAL_PATHS.help}/${slug}` : PORTAL_PATHS.help;
}
