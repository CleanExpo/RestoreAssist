import type { Metadata } from "next";

import ContractorDirectory from "./ContractorDirectory";

// RA-8542: the directory is a client component, so its metadata lives here.
// Without a canonical of its own the page inherited the home page's.
export const metadata: Metadata = {
  title: "Find restoration contractors",
  description:
    "Search the RestoreAssist directory of restoration contractors by location and specialisation.",
  alternates: { canonical: "/contractors" },
};

export default function ContractorsPage() {
  return <ContractorDirectory />;
}
