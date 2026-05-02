import { Router } from 'express';
import { Community } from '../models/community.model';
import { CommunityMessage } from '../models/communityMessage.model';
import { User } from '../models/user.model';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth';

const router = Router();

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

router.get('/browse', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const query = req.query.q ? { name: { $regex: req.query.q as string, $options: 'i' } } : {};
    const communities = await Community.find(query).sort({ isGlobal: -1, memberCount: -1 }).limit(50).lean();
    const userId = req.user!.id;
    const result = communities.map(c => {
      const members = c.members as string[];
      const joinRequests = (c.joinRequests || []) as any[];
      const pendingRequest = joinRequests.find(jr => jr.userId === userId && jr.status === 'pending');
      return {
        _id: c._id,
        name: c.name,
        description: c.description,
        memberCount: members.length,
        isGlobal: c.isGlobal,
        isPublic: c.isPublic,
        isMember: members.includes(userId),
        hasPendingRequest: !!pendingRequest,
      };
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const name = String(req.body.name || '').slice(0, 100);
    const description = String(req.body.description || '').slice(0, 500);
    if (!name || name.length < 2) {
      return res.status(400).json({ error: 'Name required (min 2 chars)' });
    }
    const existing = await Community.findOne({ name });
    if (existing) {
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

router.post('/join-request', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { communityId } = req.body;
    if (!communityId) return res.status(400).json({ error: 'communityId required' });
    const community = await Community.findById(communityId);
    if (!community) return res.status(404).json({ error: 'Not found' });
    const members = community.members as string[];
    if (members.includes(req.user!.id)) {
      return res.json({ message: 'Already a member', joined: true });
    }
    const joinRequests = (community.joinRequests || []) as any[];
    const existing = joinRequests.find(jr => jr.userId === req.user!.id && jr.status === 'pending');
    if (existing) {
      return res.json({ message: 'Request already pending', pending: true });
    }
    await Community.findByIdAndUpdate(communityId, {
      $push: { joinRequests: { userId: req.user!.id, status: 'pending', requestedAt: new Date() } },
    });
    res.json({ message: 'Join request sent', pending: true });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/accept-join', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { communityId, userId } = req.body;
    if (!communityId || !userId) return res.status(400).json({ error: 'communityId and userId required' });
    const community = await Community.findById(communityId);
    if (!community) return res.status(404).json({ error: 'Not found' });
    const members = community.members as string[];
    if (!members.includes(req.user!.id)) {
      return res.status(403).json({ error: 'Only members can accept requests' });
    }
    await Community.findByIdAndUpdate(communityId, {
      $addToSet: { members: userId },
      $set: { 'joinRequests.$[elem].status': 'accepted' },
    }, { arrayFilters: [{ 'elem.userId': userId, 'elem.status': 'pending' }] });
    res.json({ message: 'User accepted' });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/reject-join', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { communityId, userId } = req.body;
    if (!communityId || !userId) return res.status(400).json({ error: 'communityId and userId required' });
    const community = await Community.findById(communityId);
    if (!community) return res.status(404).json({ error: 'Not found' });
    const members = community.members as string[];
    if (!members.includes(req.user!.id)) {
      return res.status(403).json({ error: 'Only members can reject requests' });
    }
    await Community.findByIdAndUpdate(communityId, {
      $set: { 'joinRequests.$[elem].status': 'rejected' },
    }, { arrayFilters: [{ 'elem.userId': userId, 'elem.status': 'pending' }] });
    res.json({ message: 'User rejected' });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/pending-requests', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Not found' });
    const members = community.members as string[];
    if (!members.includes(req.user!.id)) {
      return res.status(403).json({ error: 'Only members can view requests' });
    }
    const joinRequests = (community.joinRequests || []) as any[];
    const pending = joinRequests.filter(jr => jr.status === 'pending');
    const userIds = pending.map(jr => jr.userId);
    const users = await User.find({ deviceId: { $in: userIds } }).select('deviceId name avatarId');
    const result = pending.map(jr => {
      const user = users.find(u => u.deviceId === jr.userId);
      return { userId: jr.userId, userName: user?.name || 'Unknown', requestedAt: jr.requestedAt };
    });
    res.json({ requests: result });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

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

router.get('/:id/messages', authMiddleware, async (req, res) => {
  try {
    const messages = await CommunityMessage.find({ communityId: req.params.id })
      .sort({ timestamp: 1 }).limit(100);
    res.json(messages);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/ensure-city', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const districtName = String(req.body.districtName || '').slice(0, 50);
    if (!districtName || districtName.length < 2) {
      return res.status(400).json({ error: 'districtName required (min 2 chars)' });
    }
    const name = districtName;
    let community = await Community.findOne({ name, isGlobal: false });
    if (!community) {
      community = await Community.create({
        name,
        description: `Community for ${districtName} district`,
        createdBy: req.user!.id,
        members: [req.user!.id],
        isGlobal: false,
        isPublic: true,
      });
    } else {
      await Community.findByIdAndUpdate(community._id, { $addToSet: { members: req.user!.id } });
    }
    res.json(community);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

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

router.post('/ensure-humanet', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    let community = await Community.findOne({ name: 'HumaNet', isGlobal: true });
    if (!community) {
      community = await Community.create({
        name: 'HumaNet',
        description: 'Global HumaNet community for all users',
        createdBy: req.user!.id,
        members: [req.user!.id],
        isGlobal: true,
        isPublic: true,
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
