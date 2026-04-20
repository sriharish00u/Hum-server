import mongoose, { Schema, Document } from 'mongoose'

export type ActivityStatus = 'upcoming' | 'ongoing' | 'ended'

export interface IActivity extends Document {
  title: string
  description: string
  createdBy: string
  groupId?: string
  participants: string[]
  startTime: Date
  endTime: Date
  status: ActivityStatus
  createdAt: Date
}

const ActivitySchema = new Schema<IActivity>({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  createdBy: { type: String, required: true, index: true },
  groupId: { type: String, index: true },
  participants: { type: [String], default: [] },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  status: { type: String, enum: ['upcoming', 'ongoing', 'ended'], default: 'upcoming' },
  createdAt: { type: Date, default: Date.now },
})

ActivitySchema.index({ startTime: 1 })

export const Activity = mongoose.model<IActivity>('Activity', ActivitySchema)