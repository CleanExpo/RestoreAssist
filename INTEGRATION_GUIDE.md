# Integration Guide: Bookkeeping & Trade Field Documentation APIs

This guide provides step-by-step instructions for integrating with bookkeeping platforms (XERO, MYOB, QuickBooks) and trade field documentation APIs (ASCORA, ServiceM8) in the RestoreAssist platform.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [XERO Integration](#xero-integration)
4. [MYOB Integration](#myob-integration)
5. [QuickBooks Integration](#quickbooks-integration)
6. [ASCORA Integration](#ascora-integration)
7. [ServiceM8 Integration](#servicem8-integration)
8. [Testing Integrations](#testing-integrations)
9. [Troubleshooting](#troubleshooting)

---

## Overview

These integrations allow RestoreAssist to:
- **Bookkeeping Platforms**: Automatically sync invoices, expenses, and financial data from your accounting software
- **Trade Field Documentation**: Import job data, client information, and field reports directly into your reports

All integrations use OAuth 2.0 for secure authentication and require API credentials from each platform.

---

## Prerequisites

Before starting, ensure you have:
- Admin access to your RestoreAssist account
- Admin access to the platform you want to integrate (XERO, MYOB, etc.)
- A registered application/API key from each platform (see individual sections below)
- Your RestoreAssist environment variables configured

---

## XERO Integration

### Step 1: Create XERO Application

1. Go to [XERO Developer Portal](https://developer.xero.com/)
2. Sign in with your XERO account
3. Click **"My Apps"** → **"New App"**
4. Fill in the application details:
   - **App Name**: RestoreAssist Integration
   - **OAuth 2.0 Redirect URI**: `https://your-domain.com/api/integrations/xero/callback`
   - **Scopes**: Select the following:
     - `accounting.transactions`
     - `accounting.contacts`
     - `accounting.settings.read`
     - `accounting.reports.read`
5. Click **"Create App"**
6. Copy your **Client ID** and **Client Secret**

### Step 2: Configure in RestoreAssist

1. Navigate to **Dashboard → Integrations** in RestoreAssist
2. Click **"Add Integration"** → **"XERO"**
3. Enter your credentials:
   - **Client ID**: Your XERO Client ID
   - **Client Secret**: Your XERO Client Secret
   - **Redirect URI**: Must match the one registered in XERO
4. Click **"Connect"**
5. You'll be redirected to XERO to authorize the connection
6. After authorization, you'll be redirected back to RestoreAssist

### Step 3: Verify Connection

1. Go to **Dashboard → Integrations**
2. Verify XERO shows as **"Connected"** (green status)
3. Test the connection by clicking **"Test Connection"**

### What Data is Synced

- **Invoices**: All invoices from your XERO account
- **Contacts**: Customer and supplier contacts
- **Expenses**: Expense claims and receipts
- **Reports**: Financial reports and summaries

### API Documentation
- [XERO API Documentation](https://developer.xero.com/documentation/api/accounting/overview)
- [XERO OAuth 2.0 Guide](https://developer.xero.com/documentation/guides/oauth2/overview)

---

## MYOB Integration

### Step 1: Create MYOB Application

1. Go to [MYOB Developer Portal](https://developer.myob.com/)
2. Sign in with your MYOB account
3. Navigate to **"My Apps"** → **"Create New App"**
4. Fill in the application details:
   - **App Name**: RestoreAssist Integration
   - **Redirect URI**: `https://your-domain.com/api/integrations/myob/callback`
   - **Scopes**: Request the following permissions:
     - `CompanyFile.Read`
     - `CompanyFile.Write`
     - `Contact.Read`
     - `Contact.Write`
     - `Invoice.Read`
     - `Invoice.Write`
5. Click **"Create"**
6. Copy your **API Key** and **API Secret**

### Step 2: Configure in RestoreAssist

1. Navigate to **Dashboard → Integrations** in RestoreAssist
2. Click **"Add Integration"** → **"MYOB"**
3. Enter your credentials:
   - **API Key**: Your MYOB API Key
   - **API Secret**: Your MYOB API Secret
   - **Company File ID**: Your MYOB company file identifier (optional, can be auto-detected)
4. Click **"Connect"**
5. Authorize the connection in MYOB
6. Return to RestoreAssist to verify connection

### Step 3: Verify Connection

1. Check **Dashboard → Integrations** for MYOB status
2. Ensure it shows **"Connected"**
3. Run a test sync to verify data access

### What Data is Synced

- **Company Files**: Access to your MYOB company files
- **Contacts**: Customer and supplier information
- **Invoices**: Sales and purchase invoices
- **Accounts**: Chart of accounts and transactions

### API Documentation
- [MYOB API Documentation](https://developer.myob.com/api/accountright/v2/)
- [MYOB OAuth Guide](https://developer.myob.com/api/accountright/overview/authentication/)

---

## QuickBooks Integration

### Step 1: Create QuickBooks Application

1. Go to [Intuit Developer Portal](https://developer.intuit.com/)
2. Sign in with your Intuit account
3. Go to **"My Apps"** → **"Create an app"**
4. Select **"QuickBooks Online"** as the product
5. Fill in the application details:
   - **App Name**: RestoreAssist Integration
   - **Redirect URI**: `https://your-domain.com/api/integrations/quickbooks/callback`
   - **Scopes**: Select:
     - `com.intuit.quickbooks.accounting`
     - `com.intuit.quickbooks.payment`
6. Click **"Create"**
7. Copy your **Client ID** and **Client Secret**
8. Note your **Sandbox** and **Production** URLs

### Step 2: Configure in RestoreAssist

1. Navigate to **Dashboard → Integrations** in RestoreAssist
2. Click **"Add Integration"** → **"QuickBooks"**
3. Enter your credentials:
   - **Client ID**: Your QuickBooks Client ID
   - **Client Secret**: Your QuickBooks Client Secret
   - **Environment**: Select "Sandbox" for testing or "Production" for live
4. Click **"Connect"**
5. Authorize the connection in QuickBooks
6. Verify the connection in RestoreAssist

### Step 3: Verify Connection

1. Check integration status in **Dashboard → Integrations**
2. Verify QuickBooks shows **"Connected"**
3. Test by syncing a sample invoice

### What Data is Synced

- **Invoices**: Customer invoices and estimates
- **Customers**: Customer information and contacts
- **Items**: Products and services
- **Payments**: Payment transactions
- **Reports**: Financial reports

### API Documentation
- [QuickBooks API Documentation](https://developer.intuit.com/app/developer/qbo/docs/get-started)
- [QuickBooks OAuth 2.0](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization)

---

## ASCORA Integration

### Step 1: Request ASCORA API Access

1. Contact ASCORA support to request API access
2. Provide your business details and use case
3. ASCORA will provide:
   - **API Key**: Your unique API key
   - **API Secret**: Your API secret
   - **Base URL**: API endpoint URL
   - **Documentation**: API documentation and endpoints

### Step 2: Configure in RestoreAssist

1. Navigate to **Dashboard → Integrations** in RestoreAssist
2. Click **"Add Integration"** → **"ASCORA"**
3. Enter your credentials:
   - **API Key**: Your ASCORA API Key
   - **API Secret**: Your ASCORA API Secret
   - **Base URL**: The ASCORA API endpoint (provided by ASCORA)
   - **Company ID**: Your ASCORA company identifier (if required)
4. Click **"Connect"**
5. Verify the connection status

### Step 3: Verify Connection

1. Check **Dashboard → Integrations** for ASCORA status
2. Ensure it shows **"Connected"**
3. Test by importing a sample job

### What Data is Synced

- **Jobs**: Field jobs and work orders
- **Clients**: Client information and contacts
- **Technicians**: Technician assignments and schedules
- **Reports**: Field reports and documentation
- **Photos**: Job photos and attachments

### API Documentation
- Contact ASCORA support for API documentation
- API typically uses REST endpoints with API key authentication

---

## ServiceM8 Integration

### Step 1: Create ServiceM8 API Application

1. Log in to your ServiceM8 account
2. Go to **Settings → Integrations → API**
3. Click **"Create New API Key"**
4. Fill in the details:
   - **Application Name**: RestoreAssist Integration
   - **Permissions**: Select required permissions:
     - `jobs.read`
     - `jobs.write`
     - `clients.read`
     - `clients.write`
     - `photos.read`
     - `reports.read`
5. Click **"Generate API Key"**
6. Copy your **API Key** and **API Secret**
7. Note your **Company ID** (found in ServiceM8 settings)

### Step 2: Configure in RestoreAssist

1. Navigate to **Dashboard → Integrations** in RestoreAssist
2. Click **"Add Integration"** → **"ServiceM8"**
3. Enter your credentials:
   - **API Key**: Your ServiceM8 API Key
   - **API Secret**: Your ServiceM8 API Secret
   - **Company ID**: Your ServiceM8 Company ID
   - **Base URL**: `https://api.servicem8.com` (default)
4. Click **"Connect"**
5. Verify the connection

### Step 3: Verify Connection

1. Check **Dashboard → Integrations** for ServiceM8 status
2. Ensure it shows **"Connected"**
3. Test by syncing a sample job

### What Data is Synced

- **Jobs**: Service jobs and work orders
- **Clients**: Customer information and property details
- **Technicians**: Staff assignments and availability
- **Photos**: Job photos and before/after images
- **Forms**: Completed service forms and checklists
- **Invoices**: Service invoices and quotes

### API Documentation
- [ServiceM8 API Documentation](https://developer.servicem8.com/)
- [ServiceM8 Authentication Guide](https://developer.servicem8.com/authentication)

---

## Testing Integrations

### Test Connection

1. Go to **Dashboard → Integrations**
2. Click **"Test Connection"** for each integration
3. Verify you see a success message

### Test Data Sync

1. Navigate to **Dashboard → Reports**
2. Create a new report or open an existing one
3. Look for integration data import options
4. Test importing:
   - Client information from bookkeeping platforms
   - Job data from trade field documentation platforms
   - Photos and attachments

### Verify Synced Data

1. Check that imported data appears correctly in reports
2. Verify all fields are mapped correctly
3. Test that updates sync back to the source platform (if applicable)

---

## Troubleshooting

### Common Issues

#### "Connection Failed" Error

**Possible Causes:**
- Incorrect API credentials
- Expired API tokens
- Network connectivity issues
- Platform API downtime

**Solutions:**
1. Verify your API credentials are correct
2. Check if the API key has expired (some platforms require periodic renewal)
3. Test your internet connection
4. Check the platform's status page for outages
5. Try disconnecting and reconnecting the integration

#### "Invalid Redirect URI" Error

**Solution:**
- Ensure the redirect URI in RestoreAssist matches exactly with the one registered in the platform's developer portal
- Check for trailing slashes, HTTP vs HTTPS, and port numbers

#### "Insufficient Permissions" Error

**Solution:**
- Re-authorize the connection with the correct scopes/permissions
- Check that your API key has the required permissions in the platform's settings

#### Data Not Syncing

**Possible Causes:**
- Sync schedule not configured
- API rate limits reached
- Data format mismatches

**Solutions:**
1. Check sync settings in integration configuration
2. Verify API rate limits haven't been exceeded
3. Check error logs in **Dashboard → Integrations → Logs**
4. Contact support if issues persist

### Getting Help

If you encounter issues not covered here:

1. **Check Integration Logs**: Go to **Dashboard → Integrations → [Integration Name] → Logs**
2. **Review API Documentation**: Refer to the platform's official API documentation
3. **Contact Support**: 
   - RestoreAssist Support: support@restoreassist.com
   - Platform Support: Contact the platform's support team

---

## Environment Variables

For advanced configurations, you may need to set these environment variables:

```bash
# XERO
XERO_CLIENT_ID=your_client_id
XERO_CLIENT_SECRET=your_client_secret
XERO_REDIRECT_URI=https://your-domain.com/api/integrations/xero/callback

# MYOB
MYOB_API_KEY=your_api_key
MYOB_API_SECRET=your_api_secret

# QuickBooks
QUICKBOOKS_CLIENT_ID=your_client_id
QUICKBOOKS_CLIENT_SECRET=your_client_secret
QUICKBOOKS_ENVIRONMENT=sandbox # or production

# ASCORA
ASCORA_API_KEY=your_api_key
ASCORA_API_SECRET=your_api_secret
ASCORA_BASE_URL=https://api.ascora.com

# ServiceM8
SERVICEM8_API_KEY=your_api_key
SERVICEM8_API_SECRET=your_api_secret
SERVICEM8_COMPANY_ID=your_company_id
```

---

## Security Best Practices

1. **Never Share API Credentials**: Keep your API keys and secrets secure
2. **Use Environment Variables**: Store credentials in environment variables, not in code
3. **Regular Token Rotation**: Periodically rotate API keys for security
4. **Monitor Access**: Regularly check integration logs for unauthorized access
5. **Least Privilege**: Only request the minimum permissions needed for your use case

---

## Next Steps

After setting up integrations:

1. **Configure Sync Schedule**: Set up automatic data synchronization
2. **Map Data Fields**: Ensure data fields are correctly mapped between platforms
3. **Set Up Notifications**: Configure alerts for sync failures or errors
4. **Test Workflows**: Test end-to-end workflows using integrated data

---

## Support

For additional help:
- **Documentation**: Check the RestoreAssist documentation
- **Support Email**: support@restoreassist.com
- **Platform Support**: Contact the respective platform's support team

---

*Last Updated: December 2025*

