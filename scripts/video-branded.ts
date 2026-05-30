#!/usr/bin/env node
/**
 * RestoreAssist Branded Video Generator
 *
 * Generates onboarding/tutorial videos using Node.js Canvas + ffmpeg.
 * Creates professional branded slides with animated text, without needing
 * production URLs or screen recording.
 *
 * Usage:
 *   npx tsx scripts/video-branded.ts --flow login --output ./videos
 *   npx tsx scripts/video-branded.ts --flow signup --output ./videos
 *   npx tsx scripts/video-branded.ts --flow setup-wizard --output ./videos
 *   npx tsx scripts/video-branded.ts --flow dashboard --output ./videos
 *   npx tsx scripts/video-branded.ts --flow inspections --output ./videos
 *   npx tsx scripts/video-branded.ts --flow reports --output ./videos
 *   npx tsx scripts/video-branded.ts --flow billing --output ./videos
 *   npx tsx scripts/video-branded.ts --flow team --output ./videos
 *   npx tsx scripts/video-branded.ts --flow compliance --output ./videos
 */

import { execSync } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";

const FFMPEG_PATH =
  process.env.FFMPEG_PATH ||
  path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");

// ── Brand Colours (RestoreAssist palette) ───────────────────────────────

const COLORS = {
  bgDark: "#0a0a0a",
  bgCard: "#1a1a1a",
  accent: "#8A6B4E",
  accentLight: "#C4A882",
  textPrimary: "#ffffff",
  textSecondary: "#a0a0a0",
  success: "#4CAF50",
  warning: "#FFC107",
  error: "#F44336",
  navy: "#1C2E47",
  navyLight: "#2C4A6F",
};

// ── Slide types ─────────────────────────────────────────────────────────

interface Slide {
  type: "title" | "demo" | "steps" | "callout" | "end";
  title?: string;
  subtitle?: string;
  steps?: string[];
  callout?: {
    label: string;
    text: string;
    icon: string;
  };
  durationSec: number;
  narration?: string;
}

interface FlowDefinition {
  id: string;
  title: string;
  slides: Slide[];
}

// ── Flow definitions ────────────────────────────────────────────────────

const flows: Record<string, FlowDefinition> = {
  login: {
    id: "login",
    title: "Signing in to RestoreAssist",
    slides: [
      {
        type: "title",
        title: "Signing in to RestoreAssist",
        subtitle: "Quick guide — 45 seconds",
        durationSec: 3,
        narration: "Welcome back to RestoreAssist. Here's how to sign in.",
      },
      {
        type: "demo",
        title: "Step 1: Open the App",
        subtitle: "Visit restoreassist.au or open the mobile app",
        durationSec: 5,
        narration: "Open the RestoreAssist app on your phone, or visit restoreassist.au in your browser.",
      },
      {
        type: "demo",
        title: "Step 2: Enter Your Email",
        subtitle: "Use the email you registered with",
        durationSec: 5,
        narration: "Enter your email address in the sign-in field.",
      },
      {
        type: "demo",
        title: "Step 3: Enter Your Password",
        subtitle: "Your secure RestoreAssist password",
        durationSec: 5,
        narration: "Enter your password. If you have face or fingerprint ID set up, you'll be prompted now.",
      },
      {
        type: "demo",
        title: "Step 4: Tap Sign In",
        subtitle: "You'll be taken to your dashboard",
        durationSec: 5,
        narration: "Tap the Sign In button. You'll be taken straight to your dashboard.",
      },
      {
        type: "callout",
        callout: {
          label: "Your Dashboard",
          text: "Active jobs, upcoming inspections, and workspace health — all in one place.",
          icon: "dashboard",
        },
        durationSec: 4,
        narration: "Your dashboard shows active jobs, upcoming inspections, and your workspace health.",
      },
      {
        type: "end",
        title: "You're Signed In",
        subtitle: "Need help? Visit the Help Centre or Tutorials page",
        durationSec: 3,
        narration: "You're now signed in. Need help? Visit the Help Centre anytime.",
      },
    ],
  },

  signup: {
    id: "signup",
    title: "Creating Your RestoreAssist Account",
    slides: [
      {
        type: "title",
        title: "Creating Your Account",
        subtitle: "Get set up in under 2 minutes",
        durationSec: 3,
        narration: "Welcome to RestoreAssist. Let's get your restoration business set up.",
      },
      {
        type: "demo",
        title: "Step 1: Your Details",
        subtitle: "Name, email, and a secure password",
        durationSec: 6,
        narration: "First, enter your name, email address, and choose a secure password.",
      },
      {
        type: "demo",
        title: "Step 2: Business Details",
        subtitle: "Business name and ABN — we verify automatically",
        durationSec: 6,
        narration: "Enter your business name and ABN. We verify it automatically against the Australian Business Register.",
      },
      {
        type: "demo",
        title: "Step 3: Verify Email",
        subtitle: "Check your inbox for a verification code",
        durationSec: 6,
        narration: "Check your email for a verification code and enter it here. This keeps your account secure.",
      },
      {
        type: "demo",
        title: "Step 4: Setup Wizard",
        subtitle: "5 quick steps to activate your workspace",
        durationSec: 6,
        narration: "Great! Now the Setup Wizard will guide you through activating your account. Just five quick steps.",
      },
      {
        type: "steps",
        title: "What the Wizard Covers",
        steps: [
          "Confirm your business profile",
          "AI hydrates your defaults",
          "Connect integrations (optional)",
          "Run a health check",
          "Activate your workspace",
        ],
        durationSec: 8,
        narration: "The wizard covers your business profile, AI-powered defaults, optional integrations, a health check, and finally activation.",
      },
      {
        type: "end",
        title: "Account Created",
        subtitle: "Your RestoreAssist workspace is ready",
        durationSec: 3,
        narration: "Your account is created. Welcome to RestoreAssist.",
      },
    ],
  },

  "setup-wizard": {
    id: "setup-wizard",
    title: "The RestoreAssist Setup Wizard",
    slides: [
      {
        type: "title",
        title: "Setup Wizard",
        subtitle: "5 steps to a fully activated workspace",
        durationSec: 3,
        narration: "The Setup Wizard walks you through five quick steps to get your account fully activated.",
      },
      {
        type: "demo",
        title: "Step 1: Business Profile",
        subtitle: "Confirm your details and add your logo",
        durationSec: 7,
        narration: "Step one: confirm your business details and add your company logo. This appears on all your reports.",
      },
      {
        type: "demo",
        title: "Step 2: AI Hydration",
        subtitle: "Automatic industry-specific setup",
        durationSec: 7,
        narration: "Step two: our AI hydrates your account with industry-specific defaults. Categories, equipment, and report templates — all pre-configured.",
      },
      {
        type: "demo",
        title: "Step 3: Integrations",
        subtitle: "Xero, MYOB, QuickBooks, ServiceM8 or Ascora",
        durationSec: 7,
        narration: "Step three: connect your accounting or job management software. This syncs your data automatically.",
      },
      {
        type: "demo",
        title: "Step 4: Health Check",
        subtitle: "Verify everything is working correctly",
        durationSec: 7,
        narration: "Step four: run a health check. This verifies your integrations, data sync, and all advertised capabilities.",
      },
      {
        type: "callout",
        callout: {
          label: "All Green?",
          text: "All checks passing? Tap Activate. Your workspace is now live.",
          icon: "check",
        },
        durationSec: 5,
        narration: "All green? Tap Activate. Your RestoreAssist workspace is now live.",
      },
      {
        type: "end",
        title: "Workspace Activated",
        subtitle: "You're ready to start restoring",
        durationSec: 3,
        narration: "Your workspace is activated. You're ready to start restoring with confidence.",
      },
    ],
  },

  dashboard: {
    id: "dashboard",
    title: "Your RestoreAssist Dashboard",
    slides: [
      {
        type: "title",
        title: "Your Dashboard",
        subtitle: "Everything at a glance",
        durationSec: 3,
        narration: "Your RestoreAssist dashboard is command central for your restoration business.",
      },
      {
        type: "demo",
        title: "Active Jobs",
        subtitle: "See all current jobs and their status",
        durationSec: 6,
        narration: "The Active Jobs panel shows every job in progress. Tap any job to view details, inspections, and reports.",
      },
      {
        type: "demo",
        title: "Upcoming Inspections",
        subtitle: "Never miss a site visit",
        durationSec: 6,
        narration: "Upcoming Inspections keeps track of all your scheduled site visits. Get directions, check client details, and prepare equipment.",
      },
      {
        type: "demo",
        title: "Workspace Health",
        subtitle: "Real-time status of your setup",
        durationSec: 6,
        narration: "Workspace Health shows real-time status of every advertised capability. Green means go. Yellow means attention needed.",
      },
      {
        type: "callout",
        callout: {
          label: "Quick Actions",
          text: "New Claim, New Inspection, Generate Report — one tap away",
          icon: "bolt",
        },
        durationSec: 5,
        narration: "Quick Actions let you create a new claim, start an inspection, or generate a report with just one tap.",
      },
      {
        type: "end",
        title: "You're in Control",
        subtitle: "Your restoration business, streamlined",
        durationSec: 3,
        narration: "You're in control. Your restoration business, streamlined with RestoreAssist.",
      },
    ],
  },

  inspections: {
    id: "inspections",
    title: "Inspections with RestoreAssist",
    slides: [
      {
        type: "title",
        title: "Inspections",
        subtitle: "Chain-of-custody capture, anywhere",
        durationSec: 3,
        narration: "RestoreAssist inspections maintain chain-of-custody from the moment you arrive on site.",
      },
      {
        type: "demo",
        title: "Start an Inspection",
        subtitle: "Select the job and room to inspect",
        durationSec: 6,
        narration: "From any job, tap Start Inspection. Select the room and damage type.",
      },
      {
        type: "demo",
        title: "Capture Evidence",
        subtitle: "Photos with automatic timestamps and GPS",
        durationSec: 7,
        narration: "Take photos of the damage. Each photo is automatically timestamped and GPS-tagged for legal compliance.",
      },
      {
        type: "demo",
        title: "Moisture Mapping",
        subtitle: "Record readings with custom equipment",
        durationSec: 7,
        narration: "Record moisture readings with your equipment. Custom calibration ensures accuracy.",
      },
      {
        type: "callout",
        callout: {
          label: "Chain of Custody",
          text: "Every photo, reading, and note is tamper-evident and court-admissible",
          icon: "shield",
        },
        durationSec: 5,
        narration: "Every photo, reading, and note is tamper-evident and court-admissible. Your evidence is protected.",
      },
      {
        type: "end",
        title: "Inspection Complete",
        subtitle: "Generate your report with one tap",
        durationSec: 3,
        narration: "Inspection complete. Generate your professional report with one tap.",
      },
    ],
  },

  reports: {
    id: "reports",
    title: "AI-Assisted Reports",
    slides: [
      {
        type: "title",
        title: "AI-Assisted Reports",
        subtitle: "S500-compliant, signed, and shareable",
        durationSec: 3,
        narration: "RestoreAssist uses AI to draft IICRC S500-compliant reports in minutes, not hours.",
      },
      {
        type: "demo",
        title: "AI Draft",
        subtitle: "Automatically generated from inspection data",
        durationSec: 7,
        narration: "After your inspection, tap Generate Report. AI drafts the full report using your photos, readings, and notes.",
      },
      {
        type: "demo",
        title: "Review and Edit",
        subtitle: "Professional formatting, easy editing",
        durationSec: 7,
        narration: "Review the draft. The formatting is professional and editable. Add notes, adjust scope, or sign off as-is.",
      },
      {
        type: "demo",
        title: "Digital Sign-off",
        subtitle: "Legally binding electronic signature",
        durationSec: 6,
        narration: "Sign digitally with a legally binding electronic signature. No printing required.",
      },
      {
        type: "callout",
        callout: {
          label: "Share Instantly",
          text: "Send to insurer, client, or colleague — PDF or portal access",
          icon: "share",
        },
        durationSec: 5,
        narration: "Share instantly via PDF or the client portal. Your report reaches stakeholders in seconds.",
      },
      {
        type: "end",
        title: "Report Complete",
        subtitle: "Professional, compliant, delivered",
        durationSec: 3,
        narration: "Your report is complete, compliant, and delivered. That's the RestoreAssist difference.",
      },
    ],
  },

  billing: {
    id: "billing",
    title: "Billing & Subscriptions",
    slides: [
      {
        type: "title",
        title: "Billing & Subscriptions",
        subtitle: "Transparent pricing, easy management",
        durationSec: 3,
        narration: "RestoreAssist billing is transparent and easy to manage.",
      },
      {
        type: "demo",
        title: "14-Day Free Trial",
        subtitle: "Full access, no credit card required",
        durationSec: 6,
        narration: "Start with a 14-day free trial. You get full access to every feature. No credit card required.",
      },
      {
        type: "demo",
        title: "Choose Your Plan",
        subtitle: "Pay per technician, cancel anytime",
        durationSec: 6,
        narration: "Choose a plan that fits your team. Pay per technician, cancel anytime.",
      },
      {
        type: "demo",
        title: "Stripe Checkout",
        subtitle: "Secure payment processing",
        durationSec: 6,
        narration: "Payment is processed securely via Stripe. Your card details are never stored on our servers.",
      },
      {
        type: "callout",
        callout: {
          label: "Need an Invoice?",
          text: "GST-compliant invoices emailed automatically every billing cycle",
          icon: "document",
        },
        durationSec: 5,
        narration: "Need an invoice? GST-compliant invoices are emailed automatically every billing cycle.",
      },
      {
        type: "end",
        title: "Billing Simplified",
        subtitle: "Focus on restoration, not paperwork",
        durationSec: 3,
        narration: "Billing simplified. Focus on restoration, not paperwork.",
      },
    ],
  },

  team: {
    id: "team",
    title: "Managing Your Team",
    slides: [
      {
        type: "title",
        title: "Managing Your Team",
        subtitle: "Invite, verify, and manage technicians",
        durationSec: 3,
        narration: "RestoreAssist makes it easy to invite and manage your restoration team.",
      },
      {
        type: "demo",
        title: "Invite a Technician",
        subtitle: "Send an invitation via email",
        durationSec: 6,
        narration: "From Team Settings, tap Invite. Enter their email and role. They'll receive an invitation instantly.",
      },
      {
        type: "demo",
        title: "Licence Verification",
        subtitle: "Auto-check against state registers",
        durationSec: 6,
        narration: "RestoreAssist automatically verifies their licence against state tradesperson registers. No manual checks needed.",
      },
      {
        type: "demo",
        title: "Assign Permissions",
        subtitle: "Control who can do what",
        durationSec: 6,
        narration: "Assign permissions. Control who can create jobs, run inspections, generate reports, or manage billing.",
      },
      {
        type: "callout",
        callout: {
          label: "Team Dashboard",
          text: "See everyone's activity, job assignments, and completion rates",
          icon: "users",
        },
        durationSec: 5,
        narration: "The Team Dashboard shows everyone's activity, job assignments, and completion rates at a glance.",
      },
      {
        type: "end",
        title: "Team Ready",
        subtitle: "Your crew is set up and verified",
        durationSec: 3,
        narration: "Your team is set up and verified. Everyone's ready to restore.",
      },
    ],
  },

  compliance: {
    id: "compliance",
    title: "IICRC Compliance",
    slides: [
      {
        type: "title",
        title: "IICRC Compliance",
        subtitle: "Standards-built, court-ready documentation",
        durationSec: 3,
        narration: "RestoreAssist is built on IICRC standards. Your documentation is court-ready from day one.",
      },
      {
        type: "demo",
        title: "S500 Standard",
        subtitle: "Water damage restoration best practices",
        durationSec: 7,
        narration: "Every report follows the IICRC S500 Standard for Professional Water Damage Restoration. Categories, classes, and procedures — all properly cited.",
      },
      {
        type: "demo",
        title: "Citation Format",
        subtitle: "Edition-disciplined referencing",
        durationSec: 6,
        narration: "Citations are edition-disciplined. No outdated references, no ambiguity. Every claim is defensible.",
      },
      {
        type: "demo",
        title: "Audit Trail",
        subtitle: "Complete history of every action",
        durationSec: 6,
        narration: "A complete audit trail shows who did what, when, and where. Tamper-evident and legally admissible.",
      },
      {
        type: "callout",
        callout: {
          label: "Insurance Ready",
          text: "Reports accepted by all major Australian insurers",
          icon: "verified",
        },
        durationSec: 5,
        narration: "Reports are accepted by all major Australian insurers. Reduce claim disputes and get paid faster.",
      },
      {
        type: "end",
        title: "Compliance Built-In",
        subtitle: "Not an afterthought — it's the foundation",
        durationSec: 3,
        narration: "Compliance is built in, not bolted on. That's the RestoreAssist foundation.",
      },
    ],
  },
};

// ── Canvas rendering ────────────────────────────────────────────────────

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;

async function loadCanvasModule() {
  try {
    // Dynamic import to handle both ESM and CJS
    const canvasModule = await import("canvas");
    return canvasModule;
  } catch (e) {
    console.error("[error] 'canvas' package not found:", (e as Error).message);
    console.error("  Run: pnpm add -D canvas");
    process.exit(1);
  }
}

async function createCanvas() {
  const { createCanvas: makeCanvas } = await loadCanvasModule();
  return makeCanvas(WIDTH, HEIGHT);
}

function drawRoundedRect(
  ctx: any,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function renderSlide(ctx: any, slide: Slide, frame: number, totalFrames: number) {
  const progress = frame / totalFrames;

  // Background
  ctx.fillStyle = COLORS.bgDark;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Subtle gradient overlay
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, "rgba(28, 46, 71, 0.3)");
  gradient.addColorStop(1, "rgba(10, 10, 10, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Top accent bar
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(0, 0, WIDTH, 4);

  // Bottom accent bar
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(0, HEIGHT - 4, WIDTH, 4);

  // Logo area (top left)
  ctx.fillStyle = COLORS.accentLight;
  ctx.font = "bold 20px Arial";
  ctx.fillText("RestoreAssist", 40, 45);

  ctx.fillStyle = COLORS.textSecondary;
  ctx.font = "14px Arial";
  ctx.fillText("PROFESSIONAL RESTORATION SOFTWARE", 40, 65);

  // Slide type rendering
  switch (slide.type) {
    case "title":
      renderTitleSlide(ctx, slide, progress);
      break;
    case "demo":
      renderDemoSlide(ctx, slide, progress);
      break;
    case "steps":
      renderStepsSlide(ctx, slide, progress);
      break;
    case "callout":
      renderCalloutSlide(ctx, slide, progress);
      break;
    case "end":
      renderEndSlide(ctx, slide, progress);
      break;
  }

  // Progress bar at bottom
  const barWidth = WIDTH * progress;
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(0, HEIGHT - 8, barWidth, 4);
}

function renderTitleSlide(ctx: any, slide: Slide, progress: number) {
  const fadeIn = Math.min(1, progress * 3);

  // Decorative elements
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(WIDTH / 2, HEIGHT / 2 - 30, 120, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(WIDTH / 2, HEIGHT / 2 - 30, 140, 0, Math.PI * 2);
  ctx.stroke();

  // Main title
  ctx.globalAlpha = fadeIn;
  ctx.fillStyle = COLORS.textPrimary;
  ctx.font = "bold 56px Arial";
  ctx.textAlign = "center";
  ctx.fillText(slide.title || "", WIDTH / 2, HEIGHT / 2 - 20);

  // Subtitle
  ctx.fillStyle = COLORS.textSecondary;
  ctx.font = "28px Arial";
  ctx.fillText(slide.subtitle || "", WIDTH / 2, HEIGHT / 2 + 40);

  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}

function renderDemoSlide(ctx: any, slide: Slide, progress: number) {
  const fadeIn = Math.min(1, progress * 2);
  ctx.globalAlpha = fadeIn;

  // Card background
  ctx.fillStyle = COLORS.bgCard;
  drawRoundedRect(ctx, 80, 100, WIDTH - 160, HEIGHT - 200, 16);
  ctx.fill();

  // Inner border
  ctx.strokeStyle = "rgba(138, 107, 78, 0.3)";
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, 80, 100, WIDTH - 160, HEIGHT - 200, 16);
  ctx.stroke();

  // Step number badge
  const stepNum = slide.title?.match(/Step (\d+)/)?.[1] || "";
  if (stepNum) {
    ctx.fillStyle = COLORS.accent;
    ctx.beginPath();
    ctx.arc(140, 170, 30, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.textPrimary;
    ctx.font = "bold 24px Arial";
    ctx.textAlign = "center";
    ctx.fillText(stepNum, 140, 178);
    ctx.textAlign = "left";
  }

  // Title
  ctx.fillStyle = COLORS.textPrimary;
  ctx.font = "bold 36px Arial";
  ctx.fillText(slide.title || "", stepNum ? 190 : 120, 180);

  // Subtitle
  ctx.fillStyle = COLORS.textSecondary;
  ctx.font = "22px Arial";
  ctx.fillText(slide.subtitle || "", 120, 230);

  // Decorative line
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(120, 260);
  ctx.lineTo(WIDTH - 140, 260);
  ctx.stroke();

  // Icon area (centered below)
  ctx.fillStyle = "rgba(138, 107, 78, 0.1)";
  ctx.beginPath();
  ctx.arc(WIDTH / 2, HEIGHT / 2 + 60, 80, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(WIDTH / 2, HEIGHT / 2 + 60, 80, 0, Math.PI * 2);
  ctx.stroke();

  // Pulse animation
  const pulse = Math.sin(progress * Math.PI * 4) * 0.3 + 0.7;
  ctx.fillStyle = `rgba(138, 107, 78, ${pulse * 0.2})`;
  ctx.beginPath();
  ctx.arc(WIDTH / 2, HEIGHT / 2 + 60, 100 + Math.sin(progress * Math.PI * 2) * 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
}

function renderStepsSlide(ctx: any, slide: Slide, progress: number) {
  const fadeIn = Math.min(1, progress * 2);
  ctx.globalAlpha = fadeIn;

  // Title
  ctx.fillStyle = COLORS.textPrimary;
  ctx.font = "bold 40px Arial";
  ctx.textAlign = "center";
  ctx.fillText(slide.title || "", WIDTH / 2, 140);
  ctx.textAlign = "left";

  // Steps
  if (slide.steps) {
    const startY = 200;
    const stepHeight = 70;

    slide.steps.forEach((stepText, i) => {
      const stepProgress = Math.max(0, Math.min(1, (progress - i * 0.15) * 3));
      if (stepProgress <= 0) return;

      ctx.globalAlpha = fadeIn * stepProgress;
      const y = startY + i * stepHeight;

      // Number circle
      ctx.fillStyle = COLORS.accent;
      ctx.beginPath();
      ctx.arc(120, y + 20, 20, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = COLORS.textPrimary;
      ctx.font = "bold 16px Arial";
      ctx.textAlign = "center";
      ctx.fillText(String(i + 1), 120, y + 26);
      ctx.textAlign = "left";

      // Step text
      ctx.fillStyle = COLORS.textPrimary;
      ctx.font = "24px Arial";
      ctx.fillText(stepText, 160, y + 26);

      // Connector line (except last)
      if (i < slide.steps!.length - 1) {
        ctx.strokeStyle = "rgba(138, 107, 78, 0.3)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(120, y + 45);
        ctx.lineTo(120, y + stepHeight - 10);
        ctx.stroke();
      }
    });
  }

  ctx.globalAlpha = 1;
}

function renderCalloutSlide(ctx: any, slide: Slide, progress: number) {
  const fadeIn = Math.min(1, progress * 2);
  ctx.globalAlpha = fadeIn;

  // Card
  const cardW = WIDTH - 200;
  const cardH = 300;
  const cardX = (WIDTH - cardW) / 2;
  const cardY = (HEIGHT - cardH) / 2;

  ctx.fillStyle = COLORS.navy;
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 20);
  ctx.fill();

  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 20);
  ctx.stroke();

  // Label
  if (slide.callout) {
    ctx.fillStyle = COLORS.accent;
    ctx.font = "bold 18px Arial";
    ctx.textAlign = "center";
    ctx.fillText(slide.callout.label.toUpperCase(), WIDTH / 2, cardY + 60);

    // Text
    ctx.fillStyle = COLORS.textPrimary;
    ctx.font = "32px Arial";
    const words = slide.callout.text.split(" ");
    let line = "";
    let lines: string[] = [];
    const maxWidth = cardW - 80;

    words.forEach((word) => {
      const testLine = line + word + " ";
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && line) {
        lines.push(line.trim());
        line = word + " ";
      } else {
        line = testLine;
      }
    });
    lines.push(line.trim());

    lines.forEach((lineText, i) => {
      ctx.fillText(lineText, WIDTH / 2, cardY + 120 + i * 45);
    });

    ctx.textAlign = "left";
  }

  ctx.globalAlpha = 1;
}

function renderEndSlide(ctx: any, slide: Slide, progress: number) {
  const fadeIn = Math.min(1, progress * 2);
  ctx.globalAlpha = fadeIn;

  // Large checkmark
  ctx.strokeStyle = COLORS.success;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const checkProgress = Math.min(1, progress * 3);
  if (checkProgress > 0) {
    ctx.beginPath();
    ctx.moveTo(WIDTH / 2 - 40, HEIGHT / 2 - 20);
    ctx.lineTo(WIDTH / 2 - 10, HEIGHT / 2 + 20);
    ctx.lineTo(WIDTH / 2 + 50, HEIGHT / 2 - 40);
    ctx.stroke();
  }

  // Title
  ctx.fillStyle = COLORS.textPrimary;
  ctx.font = "bold 48px Arial";
  ctx.textAlign = "center";
  ctx.fillText(slide.title || "", WIDTH / 2, HEIGHT / 2 + 60);

  // Subtitle
  ctx.fillStyle = COLORS.textSecondary;
  ctx.font = "24px Arial";
  ctx.fillText(slide.subtitle || "", WIDTH / 2, HEIGHT / 2 + 110);

  // CTA button visual
  ctx.fillStyle = COLORS.accent;
  drawRoundedRect(ctx, WIDTH / 2 - 140, HEIGHT / 2 + 150, 280, 50, 25);
  ctx.fill();

  ctx.fillStyle = COLORS.textPrimary;
  ctx.font = "bold 18px Arial";
  ctx.fillText("GET STARTED", WIDTH / 2, HEIGHT / 2 + 182);

  ctx.textAlign = "left";
  ctx.globalAlpha = 1;
}

// ── MP4 generation ──────────────────────────────────────────────────────

async function generateFrames(flow: FlowDefinition, tmpDir: string) {
  const canvas = await createCanvas();
  const ctx = canvas.getContext("2d");

  let frameIndex = 0;

  for (const slide of flow.slides) {
    const totalFrames = Math.round(slide.durationSec * FPS);

    for (let f = 0; f < totalFrames; f++) {
      renderSlide(ctx, slide, f, totalFrames);

      const framePath = path.join(tmpDir, `frame-${String(frameIndex).padStart(5, "0")}.png`);
      const buffer = canvas.toBuffer("image/png");
      await fs.writeFile(framePath, buffer);

      frameIndex++;
    }
  }

  return frameIndex;
}

async function generateMp4(
  flow: FlowDefinition,
  outputDir: string,
  tmpDir: string,
  totalFrames: number,
) {
  const outputPath = path.join(outputDir, `restoreassist-${flow.id}-v1.mp4`);
  await fs.mkdir(outputDir, { recursive: true });

  console.log(`[ffmpeg] Encoding ${totalFrames} frames → ${outputPath}`);

  try {
    execSync(
      `"${FFMPEG_PATH}" -y -framerate ${FPS} -i "${tmpDir}/frame-%05d.png" ` +
        `-c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p ` +
        `-movflags +faststart "${outputPath}"`,
      { stdio: "inherit" },
    );
  } catch (error) {
    console.error("[ffmpeg] Encoding failed:", error);
    throw error;
  }

  const stats = await fs.stat(outputPath);
  console.log(`[ffmpeg] Done: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

  return outputPath;
}

// ── CLI ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const flow = args[args.indexOf("--flow") + 1];
  const outputDir = args[args.indexOf("--output") + 1] || "./videos";
  return { flow, outputDir };
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const { flow: flowId, outputDir } = parseArgs();

  if (!flowId || !flows[flowId]) {
    console.error("Usage: npx tsx scripts/video-branded.ts --flow <id> [--output ./videos]");
    console.error("Available flows:");
    Object.entries(flows).forEach(([id, f]) => {
      console.error(`  ${id.padEnd(15)} — ${f.title}`);
    });
    process.exit(1);
  }

  const flow = flows[flowId];
  const totalDuration = flow.slides.reduce((sum, s) => sum + s.durationSec, 0);

  console.log(`========================================`);
  console.log(`RestoreAssist Branded Video Generator`);
  console.log(`Flow: ${flow.title}`);
  console.log(`Slides: ${flow.slides.length}`);
  console.log(`Duration: ${totalDuration}s`);
  console.log(`Output: ${outputDir}/restoreassist-${flow.id}-v1.mp4`);
  console.log(`========================================`);

  const tmpDir = path.join(os.tmpdir(), `restoreassist-video-${flow.id}`);
  await fs.mkdir(tmpDir, { recursive: true });

  console.log(`[render] Generating frames in ${tmpDir}...`);
  const totalFrames = await generateFrames(flow, tmpDir);
  console.log(`[render] ${totalFrames} frames generated`);

  const mp4Path = await generateMp4(flow, outputDir, tmpDir, totalFrames);

  // Cleanup frames
  await fs.rm(tmpDir, { recursive: true, force: true });

  console.log(`\n✅ Done: ${mp4Path}`);
  console.log(`   Duration: ${totalDuration}s`);
  console.log(`   Frames: ${totalFrames}`);
  console.log(`\nNext: npx tsx scripts/video-upload.ts --file ${mp4Path} --slug <slug> --title "${flow.title}"`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
