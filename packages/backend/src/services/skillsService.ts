import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// For ES modules, get __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SkillConfig {
  id?: string;
  displayTitle: string;
  description: string;
  skillPath: string;
  version: string;
  enabled: boolean;
}

interface SkillMetadata {
  id: string;
  displayTitle: string;
  description: string;
  version: string;
  latestVersion: string;
  enabled: boolean;
  createdAt: string;
  lastUsed?: string;
  usageCount: number;
}

export class SkillsService {
  private client: Anthropic;
  private skills: Map<string, SkillMetadata> = new Map();
  private skillsBasePath: string;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }

    this.client = new Anthropic({ apiKey });
    this.skillsBasePath = path.join(__dirname, '../skills');

    // Initialize skills on startup
    this.initializeSkills().catch(error => {
      console.error('Failed to initialize skills:', error);
    });
  }

  /**
   * Initialize all skills from the skills directory
   */
  private async initializeSkills(): Promise<void> {
    console.log('🎯 Initializing Anthropic Skills...');

    try {
      // Check if skills directory exists
      if (!fs.existsSync(this.skillsBasePath)) {
        console.log('Creating skills directory...');
        fs.mkdirSync(this.skillsBasePath, { recursive: true });
      }

      // Load or create documentation generator skill
      await this.ensureDocumentationGeneratorSkill();

      console.log(`✅ Skills initialized: ${this.skills.size} skill(s) loaded`);
      this.listSkills();
    } catch (error) {
      console.error('Error initializing skills:', error);
      throw error;
    }
  }

  /**
   * Ensure the documentation generator skill is created and available
   */
  private async ensureDocumentationGeneratorSkill(): Promise<void> {
    const skillPath = path.join(this.skillsBasePath, 'documentation-generator');

    // Check if skill files exist
    if (!fs.existsSync(path.join(skillPath, 'SKILL.md'))) {
      console.warn('Documentation generator skill files not found');
      return;
    }

    // Check if skill is already registered
    const existingSkillId = this.getSkillIdFromCache('documentation-generator');

    if (existingSkillId) {
      console.log(`✓ Documentation Generator Skill already registered: ${existingSkillId}`);
      this.skills.set('documentation-generator', {
        id: existingSkillId,
        displayTitle: 'RestoreAssist Documentation Generator',
        description: 'AI-powered damage assessment report generator for Australian restoration projects',
        version: '1.0.0',
        latestVersion: '1.0.0',
        enabled: true,
        createdAt: new Date().toISOString(),
        usageCount: 0
      });
      return;
    }

    // Create new skill
    try {
      console.log('Creating Documentation Generator skill...');

      const skill = await this.createSkillFromDirectory({
        displayTitle: 'RestoreAssist Documentation Generator',
        description: 'AI-powered damage assessment report generator for Australian restoration projects',
        skillPath,
        version: '1.0.0',
        enabled: true
      });

      console.log(`✅ Created Documentation Generator Skill: ${skill.id}`);

      // Cache the skill ID
      this.saveSkillIdToCache('documentation-generator', skill.id);

      this.skills.set('documentation-generator', {
        id: skill.id,
        displayTitle: 'RestoreAssist Documentation Generator',
        description: 'AI-powered damage assessment report generator for Australian restoration projects',
        version: '1.0.0',
        latestVersion: skill.latest_version || '1.0.0',
        enabled: true,
        createdAt: new Date().toISOString(),
        usageCount: 0
      });
    } catch (error) {
      console.error('Failed to create Documentation Generator skill:', error);
      throw error;
    }
  }

  /**
   * Create a skill from a directory of files
   */
  private async createSkillFromDirectory(config: SkillConfig): Promise<any> {
    const files: Array<[string, Buffer, string]> = [];

    // Read all files from the skill directory
    const readDirectory = (dir: string, baseDir: string = dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          readDirectory(fullPath, baseDir);
        } else if (entry.isFile()) {
          const relativePath = path.relative(baseDir, fullPath);
          const content = fs.readFileSync(fullPath);
          const mimeType = this.getMimeType(entry.name);

          files.push([relativePath.replace(/\\/g, '/'), content, mimeType]);
        }
      }
    };

    readDirectory(config.skillPath);

    if (files.length === 0) {
      throw new Error(`No files found in skill directory: ${config.skillPath}`);
    }

    console.log(`  Loading ${files.length} file(s) for skill: ${config.displayTitle}`);
    files.forEach(([filename]) => console.log(`    - ${filename}`));

    // Create the skill using Anthropic API
    const skill = await this.client.beta.skills.create({
      display_title: config.displayTitle,
      files: files as any,
      betas: ['skills-2025-10-02']
    });

    return skill;
  }

  /**
   * Get MIME type based on file extension
   */
  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.md': 'text/markdown',
      '.json': 'application/json',
      '.txt': 'text/plain',
      '.py': 'text/x-python',
      '.ts': 'text/typescript',
      '.js': 'text/javascript',
      '.html': 'text/html',
      '.css': 'text/css',
      '.xml': 'application/xml',
      '.yaml': 'application/x-yaml',
      '.yml': 'application/x-yaml'
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Get skill ID from cache file
   */
  private getSkillIdFromCache(skillName: string): string | null {
    const cacheFile = path.join(this.skillsBasePath, '.skill-cache.json');

    if (!fs.existsSync(cacheFile)) {
      return null;
    }

    try {
      const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      return cache[skillName] || null;
    } catch {
      return null;
    }
  }

  /**
   * Save skill ID to cache file
   */
  private saveSkillIdToCache(skillName: string, skillId: string): void {
    const cacheFile = path.join(this.skillsBasePath, '.skill-cache.json');

    let cache: Record<string, string> = {};
    if (fs.existsSync(cacheFile)) {
      try {
        cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      } catch {
        cache = {};
      }
    }

    cache[skillName] = skillId;
    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  }

  /**
   * Get skill ID for report generation
   */
  getDocumentationGeneratorSkillId(): string | null {
    const skill = this.skills.get('documentation-generator');
    return skill?.id || null;
  }

  /**
   * Get skill metadata
   */
  getSkillMetadata(skillName: string): SkillMetadata | null {
    return this.skills.get(skillName) || null;
  }

  /**
   * List all available skills
   */
  listSkills(): SkillMetadata[] {
    const skillsList = Array.from(this.skills.values());

    console.log('\n📚 Available Skills:');
    skillsList.forEach(skill => {
      console.log(`  - ${skill.displayTitle} (${skill.id})`);
      console.log(`    Version: ${skill.version} | Enabled: ${skill.enabled} | Usage: ${skill.usageCount}`);
    });
    console.log();

    return skillsList;
  }

  /**
   * Increment skill usage counter
   */
  incrementUsage(skillName: string): void {
    const skill = this.skills.get(skillName);
    if (skill) {
      skill.usageCount++;
      skill.lastUsed = new Date().toISOString();
    }
  }

  /**
   * Get skill statistics
   */
  getSkillStats(): {
    totalSkills: number;
    enabledSkills: number;
    totalUsage: number;
    skillsByUsage: Array<{ name: string; usage: number }>;
  } {
    const skillsArray = Array.from(this.skills.values());

    return {
      totalSkills: skillsArray.length,
      enabledSkills: skillsArray.filter(s => s.enabled).length,
      totalUsage: skillsArray.reduce((sum, s) => sum + s.usageCount, 0),
      skillsByUsage: skillsArray
        .map(s => ({
          name: s.displayTitle,
          usage: s.usageCount
        }))
        .sort((a, b) => b.usage - a.usage)
    };
  }

  /**
   * Enable or disable a skill
   */
  setSkillEnabled(skillName: string, enabled: boolean): boolean {
    const skill = this.skills.get(skillName);
    if (skill) {
      skill.enabled = enabled;
      console.log(`${enabled ? '✓' : '✗'} Skill "${skill.displayTitle}" ${enabled ? 'enabled' : 'disabled'}`);
      return true;
    }
    return false;
  }

  /**
   * Check if skills service is ready
   */
  isReady(): boolean {
    return this.skills.size > 0;
  }
}

// Export singleton instance
export const skillsService = new SkillsService();
