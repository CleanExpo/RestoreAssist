$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = $env:LINEAR_API_KEY
}

$body = @'
{"query": "{ issues(filter: { state: { type: { nin: [\"completed\", \"canceled\"] } } }, first: 30, orderBy: priority) { nodes { identifier title priority state { name } labels { nodes { name } } } } }"}
'@

try {
    $response = Invoke-RestMethod -Uri "https://api.linear.app/graphql" -Method Post -Headers $headers -Body $body
    $response.data.issues.nodes | ForEach-Object {
        $priority = switch ($_.priority) {
            1 { "Urgent" }
            2 { "High" }
            3 { "Medium" }
            4 { "Low" }
            default { "None" }
        }
        $labels = if ($_.labels.nodes) { ($_.labels.nodes | ForEach-Object { $_.name }) -join ", " } else { "" }
        "$($_.identifier): [$priority] $($_.title) - $($_.state.name)$(if($labels) { " [$labels]" })"
    }
} catch {
    Write-Host "Error querying Linear: $_"
}
