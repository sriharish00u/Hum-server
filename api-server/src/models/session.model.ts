import mongoose, { Schema, Document } from 'mongoose'

export type SessionType = 'UNITY' | 'REPORTX'
export type SessionStatus = 'active' | 'ended'

export interface ISession extends Document {
  type: SessionType
  title: string
  createdBy: string
  participants: string[]
  startTime: Date
  endTime?: Date
  status: SessionStatus
  createdAt: Date
}

const SessionSchema = new Schema<ISession>({
  type: { type: String, enum: ['UNITY', 'REPORTX'], required: true },
  title: { type: String, default: '' },
  createdBy: { type: String, required: true, index: true },
  participants: { type: [String], default: [] },
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date },
  status: { type: String, enum: ['active', 'ended'], default: 'active' },
  createdAt: { type: Date, default: Date.now },
})

export const Session = mongoose.model<ISession>('Session', SessionSchema)