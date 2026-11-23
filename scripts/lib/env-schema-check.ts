// RA-7784 — `.env.example` and the ENV_SCHEMA in lib/env.ts must name the
// same variables, in both directions. Names only: no value is read, compared
// or printed, and no live env file is ever opened.

export interface EnvSchemaException {
  readonly name: string;
  readonly reason: string;
}

/**
 * Documented, reasoned exceptions. Empty at RA-7784: every active name in
 * .env.example is declared. Add an entry only with a reason a reviewer can
 * check; a reason under 10 characters is rejected.
 */
export const ENV_SCHEMA_EXCEPTIONS: {
  /** Declared in ENV_SCHEMA but deliberately absent from .env.example. */
  readonly schemaOnly: readonly EnvSchemaException[];
  /** In .env.example but deliberately not declared in ENV_SCHEMA. */
  readonly exampleOnly: readonly EnvSchemaException[];
} = {
  schemaOnly: [],
  exampleOnly: [],
};

/**
 * Active `NAME=` lines of a .env.example file. Commented lines (`# NAME=`)
 * are documentation, not declarations; this matches the RA-7477 parser in
 * lib/__tests__/env-example-coverage.test.ts.
 */
export function parseEnvExampleNames(source: string): string[] {
  const names = new Set<string>();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match?.[1]) names.add(match[1]);
  }
  return [...names];
}

export interface EnvSchemaComparison {
  /** Declared in ENV_SCHEMA, missing from .env.example. */
  readonly missingFromExample: string[];
  /** In .env.example, not declared in ENV_SCHEMA. */
  readonly missingFromSchema: string[];
  /** Problems with the exception list itself. */
  readonly exceptionErrors: string[];
}

export function compareEnvSchema(
  schemaNames: readonly string[],
  exampleNames: readonly string[],
  exceptions = ENV_SCHEMA_EXCEPTIONS,
): EnvSchemaComparison {
  const schema = new Set(schemaNames);
  const example = new Set(exampleNames);
  const schemaOnly = new Set(exceptions.schemaOnly.map((e) => e.name));
  const exampleOnly = new Set(exceptions.exampleOnly.map((e) => e.name));
  const exceptionErrors: string[] = [];

  for (const e of [...exceptions.schemaOnly, ...exceptions.exampleOnly]) {
    if (e.reason.trim().length < 10) exceptionErrors.push(`${e.name}: exception needs a reason`);
  }
  for (const e of exceptions.schemaOnly) {
    if (!schema.has(e.name)) exceptionErrors.push(`${e.name}: schemaOnly exception but not declared in ENV_SCHEMA`);
    if (example.has(e.name)) exceptionErrors.push(`${e.name}: schemaOnly exception but present in .env.example (stale)`);
  }
  for (const e of exceptions.exampleOnly) {
    if (!example.has(e.name)) exceptionErrors.push(`${e.name}: exampleOnly exception but absent from .env.example`);
    if (schema.has(e.name)) exceptionErrors.push(`${e.name}: exampleOnly exception but declared in ENV_SCHEMA (stale)`);
  }

  return {
    missingFromExample: [...schema].filter((n) => !example.has(n) && !schemaOnly.has(n)).sort(),
    missingFromSchema: [...example].filter((n) => !schema.has(n) && !exampleOnly.has(n)).sort(),
    exceptionErrors,
  };
}

export function formatEnvSchemaComparison(result: EnvSchemaComparison): string[] {
  return [
    ...result.missingFromExample.map(
      (n) => `${n}: declared in lib/env.ts ENV_SCHEMA but missing from .env.example (add a placeholder line)`,
    ),
    ...result.missingFromSchema.map(
      (n) => `${n}: in .env.example but not declared in lib/env.ts ENV_SCHEMA`,
    ),
    ...result.exceptionErrors,
  ];
}
