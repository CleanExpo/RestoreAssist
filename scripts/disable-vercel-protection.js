#!/usr/bin/env node

/**
 * Script to disable Vercel Deployment Protection via API
 *
 * Vercel's Deployment Protection prevents public access to deployments.
 * This script uses the Vercel REST API to disable it programmatically.
 */

const https = require('https');
const { execSync } = require('child_process');

const PROJECT_ID = 'prj_4YJd66nqihD0OEMruMUOyz0o6FqY';
const TEAM_ID = 'team_KMZACI5rIltoCRhAtGCXlxUf';

// Get Vercel token from CLI config
function getVercelToken() {
  try {
    // Try to get token from environment first
    if (process.env.VERCEL_TOKEN) {
      return process.env.VERCEL_TOKEN;
    }

    // Try to read from Vercel CLI config
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    const fs = require('fs');
    const path = require('path');

    const authPaths = [
      path.join(homeDir, '.config', 'com.vercel.cli', 'auth.json'),
      path.join(homeDir, '.vercel', 'auth.json'),
      path.join(homeDir, 'AppData', 'Roaming', 'com.vercel.cli', 'auth.json')
    ];

    for (const authPath of authPaths) {
      if (fs.existsSync(authPath)) {
        const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
        if (auth.token) {
          return auth.token;
        }
      }
    }

    throw new Error('No Vercel token found. Please run: vercel login');
  } catch (error) {
    console.error('Error getting Vercel token:', error.message);
    throw error;
  }
}

function makeVercelRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const token = getVercelToken();

    const options = {
      hostname: 'api.vercel.com',
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve(body);
          }
        } else {
          reject(new Error(`API request failed: ${res.statusCode} - ${body}`));
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function disableDeploymentProtection() {
  console.log('🔍 Checking current project settings...\n');

  try {
    // Get current project settings
    const project = await makeVercelRequest(
      'GET',
      `/v9/projects/${PROJECT_ID}?teamId=${TEAM_ID}`
    );

    console.log('Current project settings:');
    console.log('- Name:', project.name);
    console.log('- Protection:', project.protection || 'None');
    console.log('- Protection Bypass:', project.protectionBypass || 'None');
    console.log('');

    // Update project to disable protection
    console.log('🔧 Disabling deployment protection...\n');

    const update = await makeVercelRequest(
      'PATCH',
      `/v9/projects/${PROJECT_ID}?teamId=${TEAM_ID}`,
      {
        ssoProtection: null,
        protection: null
      }
    );

    console.log('✅ Deployment protection disabled successfully!\n');
    console.log('Updated settings:');
    console.log('- Protection:', update.protection || 'None');
    console.log('- SSO Protection:', update.ssoProtection || 'None');
    console.log('');
    console.log('🚀 Please redeploy the backend for changes to take effect.');

    return true;
  } catch (error) {
    console.error('❌ Failed to disable deployment protection:');
    console.error(error.message);

    console.log('\n📋 Manual steps to disable protection:');
    console.log('1. Go to: https://vercel.com/unite-group/restore-assist-backend/settings/deployment-protection');
    console.log('2. Set "Protection Level" to "None"');
    console.log('3. Click "Save"');
    console.log('4. Redeploy the project');

    return false;
  }
}

// Run the script
disableDeploymentProtection()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });
