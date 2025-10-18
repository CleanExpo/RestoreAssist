import { Router, Request, Response } from 'express';
import { skillsService } from '../services/skillsService';
import { authenticate, authorize } from '../middleware/authMiddleware';

export const skillsRoutes = Router();

// GET /api/skills - List all skills
skillsRoutes.get('/', authenticate, (req: Request, res: Response) => {
  try {
    const skills = skillsService.listSkills();
    res.json({
      skills,
      total: skills.length
    });
  } catch (error) {
    console.error('Error fetching skills:', error);
    res.status(500).json({
      error: 'Failed to fetch skills',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/skills/stats - Get skill statistics (admin only)
skillsRoutes.get('/stats', authenticate, authorize('admin'), (req: Request, res: Response) => {
  try {
    const stats = skillsService.getSkillStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching skill stats:', error);
    res.status(500).json({
      error: 'Failed to fetch skill statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/skills/:skillName - Get specific skill metadata
skillsRoutes.get('/:skillName', authenticate, (req: Request, res: Response) => {
  try {
    const { skillName } = req.params;
    const skill = skillsService.getSkillMetadata(skillName);

    if (!skill) {
      return res.status(404).json({
        error: 'Skill not found'
      });
    }

    res.json(skill);
  } catch (error) {
    console.error('Error fetching skill:', error);
    res.status(500).json({
      error: 'Failed to fetch skill',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PATCH /api/skills/:skillName/enable - Enable/disable a skill (admin only)
skillsRoutes.patch('/:skillName/enable', authenticate, authorize('admin'), (req: Request, res: Response) => {
  try {
    const { skillName } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'enabled field must be a boolean'
      });
    }

    const success = skillsService.setSkillEnabled(skillName, enabled);

    if (!success) {
      return res.status(404).json({
        error: 'Skill not found'
      });
    }

    const skill = skillsService.getSkillMetadata(skillName);
    res.json({
      message: `Skill ${enabled ? 'enabled' : 'disabled'} successfully`,
      skill
    });
  } catch (error) {
    console.error('Error updating skill:', error);
    res.status(500).json({
      error: 'Failed to update skill',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/skills/health - Skills service health check
skillsRoutes.get('/health/status', (req: Request, res: Response) => {
  try {
    const isReady = skillsService.isReady();
    const stats = skillsService.getSkillStats();

    res.json({
      status: isReady ? 'healthy' : 'initializing',
      timestamp: new Date().toISOString(),
      skillsLoaded: stats.totalSkills,
      skillsEnabled: stats.enabledSkills,
      ready: isReady
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
