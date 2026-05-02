import { Router } from 'express'
import { Report } from '../models/report.model'
import { Activity } from '../models/activity.model'
import { Stats, incrementStat } from '../models/stats.model'
import { User } from '../models/user.model'
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth'
import { validateReport, validateActivity, validateReportStatus } from '../middleware/validation'

const router = Router()

// Reports
router.get('/reports', authMiddleware, async (req, res) => {
  try {
    const reports = await Report.find().sort({ createdAt: -1 }).limit(50)
    res.json(reports)
  } catch (e) {
    console.error('GET /reports error:', e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/reports/:id', authMiddleware, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
    if (!report) return res.status(404).json({ error: 'Not found' })
    res.json(report)
  } catch (e) {
    console.error('GET /reports/:id error:', e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/reports', authMiddleware, validateReport, async (req: AuthenticatedRequest, res) => {
  try {
    const reportData = {
      ...(req.parsedBody as object),
      createdBy: req.user!.id
    };
    const report = await Report.create(reportData)
    
    // Update global stats
    await incrementStat('reportsSubmitted');
    
    // Update user stats
    await User.findOneAndUpdate(
      { deviceId: req.user!.id },
      { $inc: { reportsSubmitted: 1, reputation: 10, impactPoints: 5 } }
    );

    res.json(report)
  } catch (e) {
    console.error('POST /reports error:', e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.patch('/reports/:id/status', authMiddleware, validateReportStatus, async (req: AuthenticatedRequest, res) => {
  try {
    const { status } = req.parsedBody as { status: 'open' | 'resolved' };
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: 'Not found' });

    if (report.createdBy !== req.user!.id) {
      return res.status(403).json({ error: 'Not authorized to modify this report' });
    }

    report.status = status;
    await report.save();

    res.json(report);
  } catch (e) {
    console.error('PATCH /reports/:id/status error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/reports/:id/upvote', authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user.id;
    
    const report = await Report.findOneAndUpdate(
      { _id: req.params.id, upvotedBy: { $ne: userId } },
      { 
        $inc: { upvotes: 1 },
        $addToSet: { upvotedBy: userId }
      },
      { new: true }
    );
    
    if (!report) return res.status(404).json({ error: 'Not found or already upvoted' });
    
    res.json(report);
  } catch (e) {
    console.error('POST /reports/:id/upvote error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Activities
router.get('/activities', authMiddleware, async (req, res) => {
  try {
    const { status } = req.query;
    const filter: any = {};
    
    if (status) {
      filter.status = status;
    } else {
      filter.status = { $in: ['upcoming', 'ongoing'] };
    }
    
    const activities = await Activity.find(filter).sort({ startTime: 1 }).limit(100);
    
    const creatorIds = [...new Set(activities.map((a) => a.createdBy))];
    const users = await User.find({ deviceId: { $in: creatorIds } }).lean();
    const nameMap: Record<string, string> = {};
    for (const u of users) {
      nameMap[u.deviceId] = u.name;
    }
    
    const result = activities.map((a) => ({
      ...a.toObject(),
      organizerName: nameMap[a.createdBy] || 'Organizer',
    }));
    
    res.json(result);
  } catch (e) {
    console.error('GET /activities error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/activities/:id', authMiddleware, async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id)
    if (!activity) return res.status(404).json({ error: 'Not found' })
    const user = await User.findOne({ deviceId: activity.createdBy });
    res.json({ ...activity.toObject(), organizerName: user?.name || 'Organizer' })
  } catch (e) {
    console.error('GET /activities/:id error:', e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/activities', authMiddleware, validateActivity, async (req: AuthenticatedRequest, res) => {
  try {
    const activityData = {
      ...(req.parsedBody as object),
      createdBy: req.user!.id
    };
    const activity = await Activity.create(activityData)
    res.json(activity)
  } catch (e) {
    console.error('POST /activities error:', e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/activities/:id/join', authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const activity = await Activity.findById(req.params.id);
    if (!activity) return res.status(404).json({ error: 'Not found' });

    if (activity.participants.length >= (activity.maxParticipants || 50)) {
      return res.status(409).json({ error: 'Activity is full' });
    }

    const updated = await Activity.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { participants: userId } },
      { returnDocument: 'after' }
    );

    await User.findOneAndUpdate(
      { deviceId: userId },
      { $inc: { activitiesJoined: 1, reputation: 5, impactPoints: 2 } }
    );

    res.json(updated)
  } catch (e) {
    console.error('POST /activities/:id/join error:', e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /activities/:id/start — organizer starts the activity
router.patch('/activities/:id/start', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const activity = await Activity.findById(req.params.id);
    if (!activity) return res.status(404).json({ error: 'Not found' });
    if (activity.createdBy !== req.user!.id) return res.status(403).json({ error: 'Not authorized' });
    if (activity.status !== 'upcoming') return res.status(409).json({ error: 'Activity already started or ended' });
    activity.status = 'ongoing';
    await activity.save();
    res.json(activity);
  } catch (e) {
    console.error('PATCH /activities/:id/start error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /activities/:id/end — organizer ends the activity
router.patch('/activities/:id/end', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const activity = await Activity.findById(req.params.id);
    if (!activity) return res.status(404).json({ error: 'Not found' });
    if (activity.createdBy !== req.user!.id) return res.status(403).json({ error: 'Not authorized' });
    if (activity.status === 'ended') return res.status(409).json({ error: 'Already ended' });
    activity.status = 'ended';
    await activity.save();
    // Award impact points to all participants
    if (activity.participants.length > 0) {
      await User.updateMany(
        { deviceId: { $in: activity.participants } },
        { $inc: { impactPoints: 3, reputation: 5 } }
      );
    }
    await incrementStat('activitiesDone');
    res.json(activity);
  } catch (e) {
    console.error('PATCH /activities/:id/end error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /activities/:id/leave — participant leaves
router.post('/activities/:id/leave', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const updated = await Activity.findByIdAndUpdate(
      req.params.id,
      { $pull: { participants: userId } },
      { returnDocument: 'after' }
    );
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (e) {
    console.error('POST /activities/:id/leave error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Server dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const [stats, reportCount, activityCount, activeReports, resolvedReports, ongoingActivities, upcomingActivities] = await Promise.all([
      Stats.findById('global'),
      Report.countDocuments(),
      Activity.countDocuments(),
      Report.countDocuments({ status: 'open' }),
      Report.countDocuments({ status: 'resolved' }),
      Activity.countDocuments({ status: 'ongoing' }),
      Activity.countDocuments({ status: 'upcoming' }),
    ])
    const s = (stats as any) || { sosHandled: 0, reportsSubmitted: 0, activitiesDone: 0, resolvedReports: 0 };
    res.json({
      sosHandled: s.sosHandled || 0,
      reportsSubmitted: reportCount,
      activitiesDone: activityCount,
      activeReports,
      resolvedReports: s.resolvedReports ?? resolvedReports,
      ongoingActivities,
      upcomingActivities,
    })
  } catch (e) {
    console.error('GET /stats error:', e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
