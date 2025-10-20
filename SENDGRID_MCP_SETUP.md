# SendGrid MCP Server Setup

## Overview

The SendGrid MCP server gives Claude Code direct access to SendGrid's Marketing API for:
- Managing contact lists
- Creating email campaigns
- Building dynamic templates
- Sending bulk emails

This is **separate** from your RestoreAssist backend transactional emails.

---

## Step 1: Get SendGrid API Key

1. Go to https://app.sendgrid.com/settings/api_keys
2. Click **Create API Key**
3. Name: "Claude Code MCP"
4. Permissions: **Full Access** (or at minimum: Mail Send + Marketing)
5. Copy the API key (starts with `SG.`)

---

## Step 2: Add to Claude Desktop Config

### Windows:
Edit `%APPDATA%\Claude\claude_desktop_config.json`

### Mac/Linux:
Edit `~/Library/Application Support/Claude/claude_desktop_config.json`

### Add this configuration:

```json
{
  "mcpServers": {
    "sendgrid": {
      "command": "node",
      "args": [
        "D:\\RestoreAssist\\sendgrid-mcp\\build\\index.js"
      ],
      "env": {
        "SENDGRID_API_KEY": "SG.paste_your_api_key_here"
      }
    }
  }
}
```

**IMPORTANT:** Replace `SG.paste_your_api_key_here` with your actual SendGrid API key!

**If you already have other MCP servers**, add the `sendgrid` entry to your existing `mcpServers` object:

```json
{
  "mcpServers": {
    "filesystem": { ... },
    "github": { ... },
    "sendgrid": {
      "command": "node",
      "args": [
        "D:\\RestoreAssist\\sendgrid-mcp\\build\\index.js"
      ],
      "env": {
        "SENDGRID_API_KEY": "SG.your_key_here"
      }
    }
  }
}
```

---

## Step 3: Restart Claude Desktop

1. Completely quit Claude Desktop (File → Exit)
2. Restart Claude Desktop
3. Open Claude Code
4. The SendGrid MCP tools should now be available

---

## Step 4: Verify Connection

In Claude Code, ask:
```
List all MCP tools
```

You should see tools like:
- `mcp__sendgrid__list_contacts`
- `mcp__sendgrid__create_contact_list`
- `mcp__sendgrid__send_email`
- etc.

---

## Available MCP Tools

Once connected, you'll have access to:

### Contact Management
- `list_contacts` - List all contacts
- `add_contact` - Add new contact
- `delete_contacts` - Remove contacts
- `get_contacts_by_list` - Get contacts in a list

### List Management
- `list_contact_lists` - List all contact lists
- `create_contact_list` - Create new list
- `delete_contact_list` - Delete list
- `add_contacts_to_list` - Add contacts to list
- `remove_contacts_from_list` - Remove contacts from list

### Email Templates
- `list_templates` - List dynamic templates
- `create_template` - Create new template
- `create_template_version` - Add template version

### Campaigns (Single Sends)
- `list_single_sends` - List all campaigns
- `create_single_send` - Create new campaign
- `schedule_single_send` - Schedule campaign
- `send_single_send_now` - Send immediately

### Sender Management
- `list_verified_senders` - List verified sender identities
- `list_unsubscribe_groups` - List unsubscribe groups

---

## Example Usage

Once configured, you can ask Claude Code:

```
Create a contact list called "RestoreAssist Beta Users" and add
john@example.com to it
```

```
Send a welcome email to all contacts in the "Beta Users" list
```

```
Create an email template for monthly product updates
```

---

## Troubleshooting

### "MCP server not found"
- Check the file path is correct (Windows uses `\\` not `/`)
- Ensure the build folder exists: `D:\RestoreAssist\sendgrid-mcp\build\`
- Run `npm run build` in the sendgrid-mcp directory

### "API key invalid"
- Verify the API key is correct (starts with `SG.`)
- Check the API key has the right permissions
- Make sure there are no extra spaces/quotes around the key

### "Tools not appearing"
- Completely quit and restart Claude Desktop
- Check the JSON syntax in claude_desktop_config.json
- Look for errors in: Help → Show Logs

---

## Next Steps

After MCP server is connected:

1. ✅ Verify sender identity in SendGrid
2. ✅ Create your first contact list
3. ✅ Build email templates
4. ✅ Set up unsubscribe groups

---

**Note:** This MCP server is for **marketing emails** (newsletters, campaigns).
For **transactional emails** (payment confirmations), configure your RestoreAssist backend separately.

See `SENDGRID_QUICKSTART.md` for backend email setup.
