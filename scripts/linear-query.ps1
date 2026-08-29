#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Read-only Linear issue query — the PowerShell twin of scripts/linear-query.ts.

.DESCRIPTION
  Lists unfinished issues using LINEAR_API_KEY, for when the Linear MCP
  connector is unavailable. Prefer scripts/linear-query.ts (npm run
  script:linear-query) — it runs anywhere Node does and offers --json,
  --state, --team and --limit. This script exists for PowerShell hosts.

  Scope differs from the .ts deliberately: that script defaults to the RA
  team, this one queries every team the key can see, which is the behaviour
  it has always had. It is read-only and performs no mutations.

.NOTES
  Requires LINEAR_API_KEY. Create one at https://linear.app/settings/api
  under Personal API keys. Exits 1 on any error.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$LinearGraphqlUrl = "https://api.linear.app/graphql"

# Linear's numeric priority scale. 0 means "no priority", not "most urgent".
$PriorityLabels = @{ 0 = "None"; 1 = "Urgent"; 2 = "High"; 3 = "Medium"; 4 = "Low" }

<#
  Strips control characters from issue-authored text before it reaches the
  terminal. Titles and labels are free text any workspace member can write, and
  an embedded ANSI sequence can repaint the row so the listing misreports which
  issue is urgent. [char]::IsControl covers exactly the C0 and C1 ranges.
#>
function Remove-ControlCharacter {
    param([AllowNull()][string]$Text)
    if ([string]::IsNullOrEmpty($Text)) { return "" }
    $builder = [System.Text.StringBuilder]::new()
    foreach ($character in $Text.ToCharArray()) {
        if (-not [char]::IsControl($character)) { [void]$builder.Append($character) }
    }
    return $builder.ToString()
}

$apiKey = $env:LINEAR_API_KEY
if ([string]::IsNullOrWhiteSpace($apiKey)) {
    Write-Error ("LINEAR_API_KEY is not set. Create a personal API key at " +
        "https://linear.app/settings/api and set it, or reconnect the Linear " +
        "MCP connector and use that instead.") -ErrorAction Continue
    exit 1
}

# orderBy accepts only createdAt and updatedAt — PaginationOrderBy in
# @linear/sdk has no priority member — so urgency is ordered client-side below.
$query = @'
query Issues($first: Int!, $filter: IssueFilter) {
  issues(first: $first, filter: $filter, orderBy: updatedAt) {
    nodes {
      identifier
      title
      priority
      state { name }
      labels { nodes { name } }
    }
  }
}
'@

# Terminal state types, spelled as Linear spells them. "duplicate" is a real
# status on the RA team and is not actionable work; "triage" is deliberately
# kept, being unresolved.
$payload = @{
    query     = $query
    variables = @{
        first  = 30
        filter = @{ state = @{ type = @{ nin = @("completed", "canceled", "duplicate") } } }
    }
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri $LinearGraphqlUrl -Method Post -Body $payload -Headers @{
        "Content-Type"  = "application/json"
        "Authorization" = $apiKey
    }
} catch {
    Write-Error "Error querying Linear: $_" -ErrorAction Continue
    exit 1
}

# Linear reports query errors inside a 200 response, so a successful call is
# not enough. Without this check an invalid query yields a null node list,
# which pipes into ForEach-Object as a single $null and prints a phantom row.
if ($response.PSObject.Properties.Name -contains "errors" -and $response.errors) {
    $messages = ($response.errors | ForEach-Object { $_.message }) -join "; "
    Write-Error "Linear GraphQL errors: $messages" -ErrorAction Continue
    exit 1
}

$nodes = @()
if ($response.PSObject.Properties.Name -contains "data" -and $response.data.issues) {
    $nodes = @($response.data.issues.nodes)
}

if ($nodes.Count -eq 0) {
    Write-Output "No matching issues."
    exit 0
}

# Urgent (1) first, with 0 last because it means "unset", not "most urgent".
$sorted = $nodes | Sort-Object { if ($_.priority -eq 0) { [int]::MaxValue } else { $_.priority } }

foreach ($node in $sorted) {
    $priority = if ($PriorityLabels.ContainsKey([int]$node.priority)) {
        $PriorityLabels[[int]$node.priority]
    } else { "None" }

    $identifier = Remove-ControlCharacter $node.identifier
    $title = Remove-ControlCharacter $node.title
    $stateName = if ($node.state) { $node.state.name } else { "Unknown" }
    $state = Remove-ControlCharacter $stateName

    $labels = ""
    if ($node.labels -and $node.labels.nodes) {
        $labels = (($node.labels.nodes | ForEach-Object { Remove-ControlCharacter $_.name }) -join ", ")
    }

    $line = "${identifier}: [$priority] $title - $state"
    if ($labels) { $line += " [$labels]" }
    Write-Output $line
}
