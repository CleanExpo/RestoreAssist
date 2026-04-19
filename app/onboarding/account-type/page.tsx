"use client";

/**
 * RA-1259: Account-type capture for Google OAuth signups.
 *
 * The credentials signup flow collects business name/ABN/ACN/state up
 * front; Google OAuth does not, which left those accounts in a
 * half-set-up state and broke downstream flows that assume business
 * fields are populated. Users flagged with `needsOnboarding=true` land
 * here via middleware until the form submits successfully.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const AU_STATES = [
  { value: "NSW", label: "New South Wales" },
  { value: "VIC", label: "Victoria" },
  { value: "QLD", label: "Queensland" },
  { value: "WA", label: "Western Australia" },
  { value: "SA", label: "South Australia" },
  { value: "TAS", label: "Tasmania" },
  { value: "ACT", label: "Australian Capital Territory" },
  { value: "NT", label: "Northern Territory" },
] as const;

const formSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(1, "Business name is required")
    .max(200, "Business name is too long"),
  abn: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, ""))
    .refine((v) => /^\d{11}$/.test(v), "ABN must be exactly 11 digits"),
  acn: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, ""))
    .refine(
      (v) => v === "" || /^\d{9}$/.test(v),
      "ACN must be exactly 9 digits if supplied",
    ),
  state: z.enum(["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"], {
    required_error: "Please select a state or territory",
  }),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({
      message: "You must accept the Terms of Service and Privacy Policy",
    }),
  }),
});

type FormValues = z.infer<typeof formSchema>;

export default function AccountTypeOnboardingPage() {
  const router = useRouter();
  const { update } = useSession();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      businessName: "",
      abn: "",
      acn: "",
      state: undefined as unknown as FormValues["state"],
      acceptedTerms: false as unknown as true,
    },
  });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding/account-type", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload?.error || "Could not save. Please try again.");
        return;
      }
      // Refresh JWT so middleware stops redirecting.
      await update();
      toast.success("Account setup complete");
      router.replace("/dashboard");
    } catch (err) {
      console.error("[onboarding] submit failed:", err);
      toast.error("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Finish setting up your account</CardTitle>
          <CardDescription>
            We just need a few business details to activate your RestoreAssist
            workspace. This takes less than a minute.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-5"
              noValidate
            >
              <FormField
                control={form.control}
                name="businessName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business name</FormLabel>
                    <FormControl>
                      <Input
                        autoComplete="organization"
                        placeholder="e.g. Coastal Restoration Pty Ltd"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="abn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ABN</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        placeholder="11 digits"
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Australian Business Number — 11 digits, spaces allowed.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="acn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ACN (optional)</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        placeholder="9 digits"
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Only required if you operate as a company registered with
                      ASIC.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State or territory</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select your primary state" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {AU_STATES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Drives the correct building codes and compliance matrix
                      for reports.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="acceptedTerms"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-start gap-3">
                      <FormControl>
                        <input
                          id="acceptedTerms"
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-neutral-300 text-cyan-600 focus:ring-cyan-500"
                          checked={Boolean(field.value)}
                          onChange={(e) => field.onChange(e.target.checked)}
                          aria-describedby="acceptedTerms-desc"
                        />
                      </FormControl>
                      <div className="space-y-1">
                        <FormLabel htmlFor="acceptedTerms">
                          I agree to the Terms of Service and Privacy Policy
                        </FormLabel>
                        <FormDescription id="acceptedTerms-desc">
                          By continuing you confirm you are authorised to act on
                          behalf of the business above.
                        </FormDescription>
                        <FormMessage />
                      </div>
                    </div>
                  </FormItem>
                )}
              />

              <div className="pt-2">
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? "Saving..." : "Finish setup"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
