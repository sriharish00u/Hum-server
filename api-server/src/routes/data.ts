import { Router } from 'express'
import { Report } from '../models/report.model'
import { Activity } from '../models/activity.model'
import { Stats } from '../models/stats.model'

const router = Router()

// Reports
router.get('/reports', async (req, res) => {
  const reports = await Report.find().sort({ createdAt: -1 }).limit(50)
  res.json(reports)
})

router.get('/reports/:id', async (req, res) => {
  const report = await Report.findById(req.params.id)
  if (!report) return res.status(404).json({ error: 'Not found' })
  res.json(report)
})

router.post('/reports', async (req, res) => {
  const report = await Report.create(req.body)
  res.json(report)
})

// Activities
router.get('/activities', async (req, res) => {
  const activities = await Activity.find().sort({ startTime: 1 })
  res.json(activities)
})

router.get('/activities/:id', async (req, res) => {
  const activity = await Activity.findById(req.params.id)
  if (!activity) return res.status(404).json({ error: 'Not found' })
  res.json(activity)
})

router.post('/activities', async (req, res) => {
  const activity = await Activity.create(req.body)
  res.json(activity)
})

router.post('/activities/:id/join', async (req, res) => {
  const { userId } = req.body
  const activity = await Activity.findByIdAndUpdate(
    req.params.id,
    { $addToSet: { participants: userId } },
    { new: true }
  )
  res.json(activity)
})

// Server dashboard stats
router.get('/stats', async (req, res) => {
  const stats = (await Stats.findById('global')) || { sosHandled: 0, reportsSubmitted: 0, activitiesDone: 0 }
  const [reportCount, activityCount] = await Promise.all([
    Report.countDocuments(),
    Activity.countDocuments(),
  ])
  res.json({
    sosHandled: (stats as any).sosHandled || 0,
    reportsSubmitted: reportCount,
    activitiesDone: activityCount,
    activeReports: await Report.countDocuments({ status: 'open' }),
    resolvedReports: await Report.countDocuments({ status: 'resolved' }),
    ongoingActivities: await Activity.countDocuments({ status: 'ongoing' }),
    upcomingActivities: await Activity.countDocuments({ status: 'upcoming' }),
  })
})

export default router
