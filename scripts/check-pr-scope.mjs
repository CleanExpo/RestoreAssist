const DEFAULT_REVIEW_FILE_LIMIT = 100;

export function evaluatePrScope(rawChangedFiles, limit = DEFAULT_REVIEW_FILE_LIMIT) {
  const changedFiles = Number(rawChangedFiles);
  if (!Number.isInteger(changedFiles) || changedFiles < 0) {
    return {
      ok: false,
      message: `PR_CHANGED_FILES must be a non-negative integer; received ${JSON.stringify(rawChangedFiles)}`,
    };
  }

  if (changedFiles > limit) {
    return {
      ok: false,
      message:
        `PR changes ${changedFiles} files, above the ${limit}-file review ceiling. ` +
        "Split or stack the work so every changed file receives review.",
    };
  }

  return {
    ok: true,
    message: `PR scope is reviewable: ${changedFiles}/${limit} changed files.`,
  };
}

if (process.argv[1]?.endsWith("check-pr-scope.mjs")) {
  const result = evaluatePrScope(process.env.PR_CHANGED_FILES);
  console.log(result.message);
  if (!result.ok) process.exitCode = 1;
}
