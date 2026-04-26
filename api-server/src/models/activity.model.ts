import mongoose, { Schema, Document } from 'mongoose'

export type ActivityStatus = 'upcoming' | 'ongoing' | 'ended'

export interface IActivity extends Document {
  title: string
  description: string
  createdBy: string
  groupId?: string
  participants: string[]
  maxParticipants: number
  startTime: Date
  endTime?: Date
  status: ActivityStatus
  createdAt: Date
  updatedAt: Date
}

const ActivitySchema = new Schema<IActivity>({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  createdBy: { type: String, required: true, index: true },
  groupId: { type: String, index: true },
  participants: { type: [String], default: [] },
  maxParticipants: { type: Number, default: 50 },
  startTime: { type: Date, required: true },
  endTime: { type: Date },
  status: { type: String, enum: ['upcoming', 'ongoing', 'ended'], default: 'upcoming' },
}, { timestamps: true })

ActivitySchema.index({ startTime: 1 })

export const Activity = mongoose.model<IActivity>('Activity', ActivitySchema)