"use client";

/**
 * RA-1259: The one step a Google or Apple signup still owes: business name and
 * terms. ABN, NZBN and state belong to the setup wizard, which comes straight
 * after. Users flagged with `needsOnboarding=true` land here via middleware
 * until the form submits successfully.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, useSession } from "next-auth/react";
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

const formSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(1, "Business name is required")
    .max(200, "Business name is too long"),
  acceptedTerms: z.literal(true, {
    error: "You must accept the Terms of Service and Privacy Policy",
  }),
});

type FormValues = z.infer<typeof formSchema>;

export default function AccountTypeOnboardingPage() {
  const router = useRouter();
  const { status, update } = useSession();
  const [submitting, setSubmitting] = useState(false);

  // A completed save can leave a stale JWT `needsOnboarding: true`.
  // Re-read the session so middleware stops bouncing dashboard links.
  useEffect(() => {
    if (status === "loading") return;
    let cancelled = false;
    void (async () => {
      const fresh = await getSession();
      if (cancelled) return;
      if (fresh?.user && !fresh.user.needsOnboarding) {
        router.replace("/setup?welcome=1");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, router]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      businessName: "",
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
        toast.error(
          payload?.error?.message ?? "Could not save. Please try again.",
        );
        return;
      }
      // Force a session re-encode so the cookie drops the stale
      // needsOnboarding claim before middleware sees /dashboard.
      await update();
      const fresh = await getSession();
      if (fresh?.user?.needsOnboarding) {
        toast.error(
          "Details saved, but your session is still catching up. Refresh the page, then continue.",
        );
        return;
      }
      window.location.assign("/setup?welcome=1");
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
          <CardTitle>
            <h1>Finish setting up your account</h1>
          </CardTitle>
          <CardDescription>
            Your business name and the terms come first. Setup follows straight
            after.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form method="post"
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
                  {submitting ? "Saving..." : "Continue to setup"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
