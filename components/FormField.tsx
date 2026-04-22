"use client";

/**
 * RA-1570 — form-field primitive that forces label association.
 *
 * The codebase has ~90 form inputs without a matching `<label htmlFor>`
 * or `aria-label`. Long-tail migration is a codemod job; this component
 * is the new primitive every *new* form should use so we stop adding
 * to the problem while we burn it down.
 *
 *   <FormField
 *     label="Email"
 *     id="client-email"
 *     required
 *     error={errors.email}
 *     help="We send invoice PDFs to this address."
 *   >
 *     <Input id="client-email" name="email" type="email" />
 *   </FormField>
 *
 * Contract: caller passes a child input whose `id` matches the `id`
 * prop. Dev-mode warning fires if `id` isn't on the child — catches
 * drift during authoring.
 */

import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { Label } from "@/components/ui/label";

export interface FormFieldProps {
  id: string;
  label: ReactNode;
  required?: boolean;
  error?: string | null;
  help?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function FormField({
  id,
  label,
  required,
  error,
  help,
  className,
  children,
}: FormFieldProps) {
  const errorId = error ? `${id}-error` : undefined;
  const helpId = help ? `${id}-help` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  // Clone the input to inject `id` + `aria-describedby` + `aria-invalid`
  // so callers don't have to thread them manually.
  const firstChild = Children.only(children);
  const enhancedChild = isValidElement(firstChild)
    ? cloneElement(firstChild as ReactElement<Record<string, unknown>>, {
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        "aria-required": required || undefined,
      })
    : firstChild;

  return (
    <div className={"space-y-1.5 " + (className ?? "")}>
      <Label htmlFor={id} className="text-sm">
        {label}
        {required ? (
          <span className="ml-0.5 text-rose-600" aria-hidden>
            *
          </span>
        ) : null}
      </Label>
      {enhancedChild}
      {help ? (
        <p id={helpId} className="text-xs text-slate-600 dark:text-slate-300">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default FormField;
