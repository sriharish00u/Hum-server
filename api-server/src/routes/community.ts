import { Router } from 'express';
import { Community } from '../models/community.model';
import { CommunityMessage } from '../models/communityMessage.model';
import { User } from '../models/user.model';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// GET /communities — list all communities (for discovery)
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const communities = await Community.find().sort({ createdAt: -1 }).limit(50).lean();
    const result = communities.map(c => ({
      ...c,
      memberCount: (c.members as string[]).length,
    }));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /communities — create community (auto-creates for city if not exists)
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const name = String(req.body.name || '').slice(0, 100);
    const description = String(req.body.description || '').slice(0, 500);
    if (!name || name.length < 2) {
      return res.status(400).json({ error: 'Name required (min 2 chars)' });
    }
    const existing = await Community.findOne({ name });
    if (existing) {
      // Auto-join instead of creating duplicate
      await Community.findByIdAndUpdate(existing._id, { $addToSet: { members: req.user!.id } });
      return res.json({ ...existing.toObject(), joined: true });
    }
    const community = await Community.create({
      name,
      description: description || '',
      createdBy: req.user!.id,
      members: [req.user!.id],
    });
    res.status(201).json(community);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /communities/:id/join
router.post('/:id/join', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const community = await Community.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { members: req.user!.id } },
      { returnDocument: 'after' }
    );
    if (!community) return res.status(404).json({ error: 'Not found' });
    res.json(community);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /communities/:id/leave
router.post('/:id/leave', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const community = await Community.findByIdAndUpdate(
      req.params.id,
      { $pull: { members: req.user!.id } },
      { returnDocument: 'after' }
    );
    if (!community) return res.status(404).json({ error: 'Not found' });
    res.json(community);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /communities/:id/members
router.get('/:id/members', authMiddleware, async (req, res) => {
  try {
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Not found' });
    const users = await User.find({ deviceId: { $in: community.members } }).select('deviceId name avatarId');
    res.json({ members: users, memberCount: users.length });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /communities/:id/messages
router.get('/:id/messages', authMiddleware, async (req, res) => {
  try {
    const messages = await CommunityMessage.find({ communityId: req.params.id })
      .sort({ timestamp: 1 }).limit(100);
    res.json(messages);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /communities/city-default — get or create city community (called on first boot)
router.post('/city-default', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const cityName = String(req.body.cityName || '').slice(0, 50);
    if (!cityName || cityName.length < 2) {
      return res.status(400).json({ error: 'cityName required (min 2 chars)' });
    }
    const name = `${cityName} Community`;
    let community = await Community.findOne({ name });
    if (!community) {
      community = await Community.create({
        name,
        description: `Default community for ${cityName}`,
        createdBy: req.user!.id,
        members: [req.user!.id],
      });
    } else {
      await Community.findByIdAndUpdate(community._id, { $addToSet: { members: req.user!.id } });
    }
    res.json(community);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
