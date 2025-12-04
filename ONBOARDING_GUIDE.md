# RestoreAssist Onboarding Guide

Welcome to RestoreAssist! This guide will help you understand what you need to do before and after signing up to get the most out of the platform.

## 📋 What You Need to Know

### Before Signing Up

Before creating your account, it's helpful to understand what RestoreAssist offers:

- **Free Trial**: Start with 3 free credits to test the platform
- **Professional Reports**: Generate comprehensive water damage inspection reports
- **AI-Powered Analysis**: Advanced report generation using AI
- **Client Management**: Organize and manage your clients
- **Pricing Configuration**: Set your own rates for labor, equipment, and services

### After Signing Up

Once you've created your account, you'll need to complete these steps to unlock all features:

1. **Upgrade Your Package** (Required for full features)
2. **Configure API Key** (Required for AI-powered reports)
3. **Set Up Pricing Configuration** (Required for accurate cost estimates)

---

## 🚀 Step-by-Step Onboarding Process

### Step 1: Upgrade Your Package

**Why it's needed:**
- Free trial accounts have limited credits (3 reports)
- Upgraded accounts get unlimited reports and access to all features
- Required to configure API keys and pricing

**How to upgrade:**
1. After signing up, you'll be redirected to the Dashboard
2. Click on **"Upgrade Package"** in the sidebar or navigation
3. Choose a plan that fits your needs:
   - **Professional Plan**: For individual technicians
   - **Enterprise Plan**: For larger teams and companies
4. Complete the payment process
5. Your account will be activated immediately

**What you get:**
- Unlimited report generation
- Access to API integrations
- Priority support
- Advanced features

---

### Step 2: Configure Your API Key

**Why it's needed:**
- RestoreAssist uses AI to generate professional, comprehensive reports
- API keys enable the AI-powered features
- Required for enhanced report generation

**Which API provider should you use?**

RestoreAssist supports three AI providers. Choose the one that best fits your needs:

#### Option A: Anthropic (Claude) - Recommended ⭐

**Best for:** High-quality, detailed reports with excellent reasoning

**Where to get your API key:**
1. Visit [https://console.anthropic.com/](https://console.anthropic.com/)
2. Sign up or log in to your Anthropic account
3. Navigate to **"API Keys"** in the dashboard
4. Click **"Create Key"**
5. Give your key a name (e.g., "RestoreAssist Production")
6. Copy the API key (you'll only see it once!)
7. Store it securely

**Pricing:** Pay-as-you-go, typically $0.003 per 1K input tokens and $0.015 per 1K output tokens

**Get started:** [https://console.anthropic.com/](https://console.anthropic.com/)

---

#### Option B: OpenAI (GPT-4)

**Best for:** Widely available, reliable AI responses

**Where to get your API key:**
1. Visit [https://platform.openai.com/](https://platform.openai.com/)
2. Sign up or log in to your OpenAI account
3. Click on your profile icon → **"View API keys"**
4. Click **"Create new secret key"**
5. Give your key a name (e.g., "RestoreAssist")
6. Copy the API key immediately (you won't be able to see it again)
7. Store it securely

**Pricing:** Pay-as-you-go, varies by model (GPT-4 is more expensive than GPT-3.5)

**Get started:** [https://platform.openai.com/](https://platform.openai.com/)

---

#### Option C: Google Gemini

**Best for:** Cost-effective option with good performance

**Where to get your API key:**
1. Visit [https://makersuite.google.com/app/apikey](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click **"Create API Key"**
4. Select or create a Google Cloud project
5. Copy the generated API key
6. Store it securely

**Pricing:** Free tier available, then pay-as-you-go pricing

**Get started:** [https://makersuite.google.com/app/apikey](https://makersuite.google.com/app/apikey)

---

**How to configure in RestoreAssist:**
1. After upgrading, go to **"Integrations"** in the sidebar
2. Click **"Add Integration"** or **"Connect"** next to your chosen provider
3. Select the API provider (Anthropic, OpenAI, or Gemini)
4. Paste your API key
5. Click **"Save"** or **"Connect"**
6. Your integration status will show as "Connected" ✅

**Security Note:** 
- API keys are encrypted and stored securely
- Never share your API keys publicly
- You can regenerate keys from your provider's dashboard if needed

---

### Step 3: Set Up Pricing Configuration

**Why it's needed:**
- Ensures accurate cost estimates in your reports
- Reflects your company's actual rates
- Required for generating professional quotes

**What you'll configure:**

1. **Labor Rates:**
   - Master Qualified Technician (Normal Hours, Saturday, Sunday)
   - Qualified Technician (Normal Hours, Saturday, Sunday)
   - Labourer (Normal Hours, Saturday, Sunday)

2. **Equipment Daily Rental Rates:**
   - Air Movers (Axial and Centrifugal)
   - Dehumidifiers (LGR and Desiccant)
   - AFD Units
   - Extraction Equipment (Truck-mounted and Electric)
   - Injection Drying Systems

3. **Chemical Treatment Rates** (per square meter):
   - Antimicrobial Treatment
   - Mould Remediation Treatment
   - Biohazard Treatment

4. **Fees:**
   - Administration Fee
   - Call Out Fee
   - Thermal Camera Use Cost

5. **Custom Fields** (Optional):
   - Add your own custom labor categories
   - Add custom equipment types
   - Add custom chemical treatments
   - Add custom fees

**How to configure:**
1. Go to **"Pricing Configuration"** in the sidebar
2. Fill in all required fields with your company's rates
3. Add custom fields if needed
4. Click **"Save Configuration"**
5. Your pricing will be used in all future reports

**Tips:**
- Use your standard company rates
- You can update pricing anytime
- Custom fields allow you to add items specific to your business
- All rates should be in your local currency (AUD by default)

---

## 🎯 Quick Start Checklist

After signing up, complete these steps in order:

- [ ] **Upgrade your package** → Go to Dashboard → Click "Upgrade Package"
- [ ] **Get an API key** → Choose a provider (Anthropic recommended) → Get your key
- [ ] **Configure API key** → Go to Integrations → Add your API key
- [ ] **Set up pricing** → Go to Pricing Configuration → Enter your rates
- [ ] **Create your first report** → Go to "New Report" → Start creating!

---

## ❓ Frequently Asked Questions

### Do I need to complete all steps immediately?

No! You can skip steps and complete them later. However:
- **Without upgrade**: Limited to 3 free reports
- **Without API key**: Basic reports only (no AI enhancement)
- **Without pricing config**: Reports won't include accurate cost estimates

### Can I change my API provider later?

Yes! You can add multiple API keys or switch providers anytime from the Integrations page.

### What if I don't have an API key yet?

You can still use RestoreAssist with basic features, but AI-powered report generation won't be available. We recommend getting an API key for the best experience.

### How much do API keys cost?

- **Anthropic**: ~$0.003-0.015 per 1K tokens (very affordable)
- **OpenAI**: Varies by model, typically $0.01-0.03 per 1K tokens
- **Gemini**: Free tier available, then pay-as-you-go

Most reports use a few thousand tokens, so costs are typically very low (cents per report).

### Can I use multiple API keys?

Yes! You can configure multiple integrations and switch between them.

### What happens if I skip the onboarding steps?

You can skip any step and complete it later. The onboarding modal will remind you when you try to create a new report. However, some features may be limited until you complete the setup.

---

## 🆘 Need Help?

If you encounter any issues during onboarding:

1. **Check the Help & Support** section in your dashboard
2. **Contact Support** through the platform
3. **Review this guide** for step-by-step instructions

---

## 🎉 You're All Set!

Once you've completed all three steps, you're ready to create professional water damage inspection reports with RestoreAssist!

**Next Steps:**
- Create your first report
- Add clients to your database
- Explore advanced features
- Customize your workflow

Welcome to RestoreAssist! 🚀

