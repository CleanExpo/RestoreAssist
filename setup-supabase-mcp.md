# Setup Supabase MCP Server

## Quick Setup Instructions

To connect the Supabase MCP server to Claude Code, you need to add the configuration to your Claude settings.

### Option 1: Via Claude Code Settings UI

1. Open Claude Code
2. Click on the gear icon (⚙️) or press `Ctrl+,`
3. Navigate to **MCP Servers** section
4. Click **Add Server**
5. Paste this configuration:

```json
{
  "supabase": {
    "type": "http",
    "url": "https://mcp.supabase.com/mcp?project_ref=hdfggelozqzdxvupbnbp"
  }
}
```

6. Save and **restart Claude Code**

### Option 2: Manual Configuration File Edit

**For Windows:**
1. Open: `%APPDATA%\Claude\claude_desktop_config.json`
2. Add the Supabase server to the `mcpServers` section:

```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=hdfggelozqzdxvupbnbp"
    },
    ... other servers ...
  }
}
```

3. Save the file
4. **Restart Claude Code completely**

**For Mac:**
1. Open: `~/Library/Application Support/Claude/claude_desktop_config.json`
2. Follow same steps as Windows

**For Linux:**
1. Open: `~/.config/Claude/claude_desktop_config.json`
2. Follow same steps as Windows

### After Setup

Once you restart Claude Code, I will be able to:
- ✅ Connect to your Supabase project
- ✅ Reset database passwords
- ✅ Update connection strings
- ✅ Manage database security settings
- ✅ View connection logs for unauthorized access

### Then We Can:

1. **Reset the exposed database passwords** through the Supabase API
2. **Generate new secure connection strings** automatically
3. **Update Vercel environment variables** (you'll need to do this manually)
4. **Verify the rotation** was successful

---

## Current Status

⚠️ **CRITICAL REMINDER:**

The following database credentials are **STILL EXPOSED** and need rotation:

**Database #1:**
- Project: qwoggbbavikzhypzodcr
- Password: NwtXEg6aVNs7ZstH (EXPOSED in git history)

**Database #2:**
- Project: oxeiaavuspvpvanzcrjc
- Password: b6q4kWNS0t4OZAWK (EXPOSED in git history)

**Project in MCP config:**
- Project: hdfggelozqzdxvupbnbp
- Status: Not yet connected

---

## Alternative: Manual Rotation

If you prefer to rotate manually while I help with Vercel:

1. **Supabase Dashboard:** https://supabase.com/dashboard/project/hdfggelozqzdxvupbnbp
2. Go to **Settings** → **Database**
3. Click **Reset Database Password**
4. Copy the new password
5. Update DATABASE_URL format:
   ```
   postgresql://postgres.[PROJECT_ID]:[NEW_PASSWORD]@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true
   ```

Then tell me the new DATABASE_URL and I can help update Vercel!
