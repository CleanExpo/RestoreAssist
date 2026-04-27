"use client";

import { X, Users } from "lucide-react";
import type { FormEventHandler } from "react";
import type { UseFormReturn } from "react-hook-form";
import { cn } from "@/lib/utils";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { ClientFormValues } from "@/lib/clients/form";

interface AddClientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: UseFormReturn<ClientFormValues>;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

export function AddClientModal({
  open,
  onOpenChange,
  form,
  onSubmit,
}: AddClientModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div
        className={cn(
          "rounded-lg border max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto",
          "bg-white dark:bg-slate-800",
          "border-neutral-200 dark:border-slate-700",
        )}
      >
        <div className="flex items-center justify-between mb-4">
          <h2
            className={cn(
              "text-xl font-semibold",
              "text-neutral-900 dark:text-white",
            )}
          >
            Add New Client
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            className={cn(
              "p-1 rounded transition-all duration-200 hover:scale-110 active:scale-95",
              "hover:bg-neutral-100 dark:hover:bg-slate-700",
              "text-neutral-700 dark:text-slate-300",
            )}
            title="Close"
          >
            <X size={20} className="transition-transform duration-200" />
          </button>
        </div>
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client Name *</FormLabel>
                    <FormControl>
                      <input
                        type="text"
                        placeholder="Enter client name"
                        className={cn(
                          "w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50",
                          "bg-white dark:bg-slate-700/50",
                          "border-neutral-300 dark:border-slate-600",
                          "text-neutral-900 dark:text-white",
                          "placeholder-neutral-500 dark:placeholder-slate-500",
                        )}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl>
                      <input
                        type="email"
                        placeholder="Enter email address"
                        className={cn(
                          "w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50",
                          "bg-white dark:bg-slate-700/50",
                          "border-neutral-300 dark:border-slate-600",
                          "text-neutral-900 dark:text-white",
                          "placeholder-neutral-500 dark:placeholder-slate-500",
                        )}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <input
                        type="tel"
                        placeholder="Enter phone number"
                        className={cn(
                          "w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50",
                          "bg-white dark:bg-slate-700/50",
                          "border-neutral-300 dark:border-slate-600",
                          "text-neutral-900 dark:text-white",
                          "placeholder-neutral-500 dark:placeholder-slate-500",
                        )}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <FormControl>
                      <select
                        className={cn(
                          "w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50",
                          "bg-white dark:bg-slate-700/50",
                          "border-neutral-300 dark:border-slate-600",
                          "text-neutral-900 dark:text-white",
                        )}
                        {...field}
                      >
                        <option value="ACTIVE">Active</option>
                        <option value="INACTIVE">Inactive</option>
                        <option value="PROSPECT">Prospect</option>
                        <option value="ARCHIVED">Archived</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="company"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company</FormLabel>
                  <FormControl>
                    <input
                      type="text"
                      placeholder="Enter company name"
                      className={cn(
                        "w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50",
                        "bg-white dark:bg-slate-700/50",
                        "border-neutral-300 dark:border-slate-600",
                        "text-neutral-900 dark:text-white",
                        "placeholder-neutral-500 dark:placeholder-slate-500",
                      )}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="contactPerson"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Person</FormLabel>
                  <FormControl>
                    <input
                      type="text"
                      placeholder="Enter contact person name"
                      className={cn(
                        "w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50",
                        "bg-white dark:bg-slate-700/50",
                        "border-neutral-300 dark:border-slate-600",
                        "text-neutral-900 dark:text-white",
                        "placeholder-neutral-500 dark:placeholder-slate-500",
                      )}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <input
                      type="text"
                      placeholder="Enter address"
                      className={cn(
                        "w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50",
                        "bg-white dark:bg-slate-700/50",
                        "border-neutral-300 dark:border-slate-600",
                        "text-neutral-900 dark:text-white",
                        "placeholder-neutral-500 dark:placeholder-slate-500",
                      )}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <textarea
                      placeholder="Enter any additional notes"
                      rows={3}
                      className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.formState.errors.root && (
              <p className="text-destructive text-sm" role="alert">
                {form.formState.errors.root.message}
              </p>
            )}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex-1 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={form.formState.isSubmitting}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 group disabled:opacity-50"
              >
                <Users className="w-4 h-4 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-12" />
                <span>Add Client</span>
              </button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
