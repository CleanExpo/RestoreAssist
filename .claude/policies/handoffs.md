# Handoff Protocol

JSON contracts for passing context between agents with clear responsibilities and expectations.

## Handoff Structure

Every handoff between agents follows this structure:

```json
{
  "from_agent": "coder",
  "to_agent": "tester",
  "timestamp": "2024-01-15T10:30:00Z",
  "context": {
    "task": "Implement user search",
    "completed": ["API endpoint", "Frontend component"],
    "files_modified": ["src/api/search.ts", "src/components/Search.tsx"],
    "next_steps": ["Create tests", "Verify edge cases"]
  },
  "requirements": {
    "must_test": ["Search with empty query", "Search with special chars"],
    "must_verify": ["API rate limiting", "Response caching"]
  },
  "metadata": {
    "priority": "high",
    "estimated_effort": "2 hours",
    "dependencies": []
  }
}
```

## Agent-Specific Handoffs

### Research → Coder

```json
{
  "from_agent": "research",
  "to_agent": "coder",
  "context": {
    "task": "Implement OAuth authentication",
    "findings": {
      "recommended_library": "next-auth",
      "patterns_found": ["JWT tokens", "Refresh tokens", "Session management"],
      "best_practices": [
        "Use httpOnly cookies for tokens",
        "Implement CSRF protection",
        "Add rate limiting on auth endpoints"
      ]
    },
    "references": [
      "https://next-auth.js.org/configuration/options",
      "https://owasp.org/www-project-top-ten/"
    ]
  },
  "requirements": {
    "must_implement": [
      "Google OAuth provider",
      "GitHub OAuth provider",
      "Secure token storage"
    ],
    "must_avoid": [
      "Storing tokens in localStorage",
      "Missing CSRF protection"
    ]
  }
}
```

### Coder → Tester

```json
{
  "from_agent": "coder",
  "to_agent": "tester",
  "context": {
    "task": "User search implementation complete",
    "files_created": [
      "src/app/api/search/route.ts",
      "src/components/SearchBar.tsx",
      "src/hooks/useSearch.ts"
    ],
    "files_modified": [
      "src/app/dashboard/page.tsx"
    ],
    "implementation_details": {
      "api_endpoint": "/api/search",
      "query_params": ["q", "limit", "offset"],
      "response_format": "{ results: [], total: number }"
    }
  },
  "requirements": {
    "must_test": [
      "Empty search query",
      "Special characters in query",
      "Pagination works correctly",
      "Rate limiting triggers at 100 req/min",
      "Results match expected format"
    ],
    "performance_requirements": {
      "response_time": "< 200ms",
      "concurrent_users": "> 100"
    }
  },
  "notes": [
    "Search uses fuzzy matching with Postgres full-text search",
    "Results are cached in Redis for 5 minutes",
    "Rate limiting implemented per user"
  ]
}
```

### Tester → Integrator

```json
{
  "from_agent": "tester",
  "to_agent": "integrator",
  "context": {
    "task": "Search tests complete",
    "test_results": {
      "total": 15,
      "passed": 14,
      "failed": 1,
      "skipped": 0
    },
    "test_files": [
      "tests/api/search.test.ts",
      "tests/e2e/search.spec.ts"
    ]
  },
  "issues_found": [
    {
      "severity": "medium",
      "description": "Search fails with queries > 100 characters",
      "file": "src/app/api/search/route.ts:45",
      "fix_needed": "Add input validation"
    }
  ],
  "requirements": {
    "must_fix": ["Input validation issue"],
    "must_verify": [
      "All tests pass after fix",
      "Integration with dashboard works",
      "No console errors"
    ]
  }
}
```

### Integrator → Master-Fullstack

```json
{
  "from_agent": "integrator",
  "to_agent": "master-fullstack",
  "context": {
    "task": "Search feature integrated",
    "integration_points": {
      "frontend": "Dashboard search bar connected",
      "api": "Endpoint exposed at /api/search",
      "database": "Indexes added for performance"
    },
    "files_affected": [
      "src/app/dashboard/page.tsx",
      "src/components/SearchBar.tsx",
      "src/app/api/search/route.ts",
      "prisma/schema.prisma"
    ],
    "tests_status": "All 15 tests passing"
  },
  "requirements": {
    "verify_completeness": [
      "No missing configurations",
      "No TODO comments",
      "Documentation updated",
      "Error handling complete"
    ]
  }
}
```

### Master-Fullstack → Master-DevOps

```json
{
  "from_agent": "master-fullstack",
  "to_agent": "master-devops",
  "context": {
    "task": "Search feature ready for deployment",
    "completeness_check": {
      "frontend": "complete",
      "backend": "complete",
      "database": "complete",
      "tests": "complete",
      "docs": "complete"
    },
    "environment_variables": [
      "SEARCH_RATE_LIMIT=100",
      "SEARCH_CACHE_TTL=300"
    ]
  },
  "requirements": {
    "deployment_checklist": [
      "Run database migration for search indexes",
      "Update environment variables",
      "Clear Redis cache after deployment",
      "Monitor search performance for first hour"
    ],
    "rollback_plan": {
      "migration": "prisma migrate down",
      "feature_flag": "ENABLE_SEARCH=false"
    }
  }
}
```

### Master-DevOps → Master-Docs

```json
{
  "from_agent": "master-devops",
  "to_agent": "master-docs",
  "context": {
    "task": "Search feature deployed to production",
    "deployment_details": {
      "version": "1.3.0",
      "environment": "production",
      "deployed_at": "2024-01-15T14:30:00Z",
      "status": "success"
    },
    "changes_deployed": [
      "User search with autocomplete",
      "Advanced filtering (role, status, date)",
      "Rate limiting on search endpoint"
    ]
  },
  "requirements": {
    "documentation_updates": [
      "Add search feature to README",
      "Update CHANGELOG for v1.3.0",
      "Document search API endpoint",
      "Add migration guide if needed"
    ]
  }
}
```

## Special Handoffs

### Stuck → User

When an agent encounters a blocker:

```json
{
  "from_agent": "stuck",
  "to": "user",
  "context": {
    "task": "Implement payment processing",
    "blocker": "Multiple payment providers available",
    "analysis": {
      "options": [
        {
          "name": "Stripe",
          "pros": ["Best documentation", "Most features"],
          "cons": ["Higher fees"]
        },
        {
          "name": "PayPal",
          "pros": ["Lower fees", "Familiar to users"],
          "cons": ["Complex integration"]
        }
      ],
      "recommendation": "Stripe for better developer experience"
    }
  },
  "question": "Which payment provider should we use?",
  "choices": ["Stripe", "PayPal", "Both", "Other"],
  "impact": "Affects integration timeline and ongoing costs"
}
```

### Any Agent → Stuck

When an agent needs help:

```json
{
  "from_agent": "coder",
  "to_agent": "stuck",
  "context": {
    "task": "Fix performance issue",
    "problem": "Database queries timing out under load",
    "attempted_solutions": [
      "Added indexes (minimal improvement)",
      "Increased connection pool (no change)",
      "Added caching (helped but not enough)"
    ],
    "current_status": "API still timing out at >50 concurrent users"
  },
  "requirements": {
    "need_analysis": true,
    "need_alternatives": true,
    "need_recommendation": true
  }
}
```

## Handoff Best Practices

### Clear Context
```json
{
  "context": {
    "what_was_done": "Implemented search API",
    "how_it_works": "Uses PostgreSQL full-text search with Redis caching",
    "why_this_approach": "Best balance of performance and simplicity",
    "what_remains": "Frontend integration"
  }
}
```

### Actionable Requirements
```json
{
  "requirements": {
    "must_do": ["Add input validation", "Write tests"],
    "should_do": ["Add logging", "Document edge cases"],
    "could_do": ["Add metrics", "Implement analytics"]
  }
}
```

### Complete File Lists
```json
{
  "files": {
    "created": ["src/api/search.ts"],
    "modified": ["src/app/page.tsx", "src/types/api.ts"],
    "deleted": [],
    "moved": [
      {
        "from": "src/utils/search.ts",
        "to": "src/lib/search.ts"
      }
    ]
  }
}
```

### Test Coverage
```json
{
  "testing": {
    "unit_tests": {
      "file": "tests/search.test.ts",
      "coverage": "95%",
      "passing": true
    },
    "integration_tests": {
      "file": "tests/api/search.test.ts",
      "coverage": "80%",
      "passing": true
    },
    "e2e_tests": {
      "file": "tests/e2e/search.spec.ts",
      "passing": false,
      "failing_tests": ["Search with special characters"]
    }
  }
}
```

## Error Handoffs

When handoff fails or cannot proceed:

```json
{
  "from_agent": "tester",
  "to_agent": "coder",
  "status": "blocked",
  "context": {
    "task": "Test search functionality",
    "blocker": "Tests cannot run - missing test database"
  },
  "requirements": {
    "must_fix": ["Set up test database", "Add test data seeds"],
    "then_retry": true
  },
  "escalation": {
    "required": false,
    "reason": "Can be fixed by coder"
  }
}
```

## Verification Checklist

Before handing off, verify:

```
- [ ] Context is complete and clear
- [ ] All files are listed
- [ ] Requirements are actionable
- [ ] Next steps are obvious
- [ ] No ambiguity in expectations
- [ ] Relevant links/references included
- [ ] Success criteria defined
```

---

**Remember**: Clear handoffs prevent rework. Spend time on context, save time overall.
