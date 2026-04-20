import mongoose, { Schema, Document } from 'mongoose'

export interface IStats {
  _id: string
  sosHandled: number
  reportsSubmitted: number
  activitiesDone: number
}

const StatsSchema = new Schema<IStats>({
  _id: { type: String },
  sosHandled: { type: Number, default: 0 },
  reportsSubmitted: { type: Number, default: 0 },
  activitiesDone: { type: Number, default: 0 },
})

export const Stats = mongoose.model<IStats>('Stats', StatsSchema)

// Helper: increment a stat field atomically
export async function incrementStat(field: keyof Omit<IStats, '_id'>): Promise<void> {
  await Stats.findByIdAndUpdate(
    'global',
    { $inc: { [field]: 1 } },
    { upsert: true, new: true }
  )
}