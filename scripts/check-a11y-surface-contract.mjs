import { readFileSync } from "node:fs";

const contracts = [
  {
    file: "app/portal/reports/[id]/page.tsx",
    required: [
      "<Dialog",
      "<DialogContent",
      "<DialogTitle",
      "<DialogDescription",
      "<Label htmlFor=",
      "min-h-11",
      "bg-brand-cta text-white",
    ],
  },
  {
    file: "app/portal/signup/page.tsx",
    required: [
      'htmlFor="portal-signup-email"',
      'htmlFor="portal-signup-name"',
      'htmlFor="portal-signup-password"',
      "min-h-11",
    ],
  },
  {
    file: "components/settings/OrganizationLocaleSetting.tsx",
    required: [
      'htmlFor="settings-country"',
      'htmlFor="settings-timezone"',
      "min-h-11",
      'aria-labelledby="organisation-locale-title"',
    ],
  },
];

const failures = [];
for (const contract of contracts) {
  const source = readFileSync(contract.file, "utf8");
  for (const required of contract.required) {
    if (!source.includes(required)) {
      failures.push(`${contract.file}: missing ${JSON.stringify(required)}`);
    }
  }
}
if (failures.length > 0) {
  console.error(`Accessibility surface contract failed:\n${failures.join("\n")}`);
  process.exit(1);
}
console.log("Accessibility surface contract passed for changed user flows.");
