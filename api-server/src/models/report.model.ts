import mongoose, { Schema, Document } from 'mongoose'

export interface IReport extends Document {
  title: string
  text: string
  createdBy: string
  location: {
    latitude: number
    longitude: number
    address?: string
  }
  mediaUrl?: string
  anonymous: boolean
  status: 'open' | 'resolved'
  createdAt: Date
}

const ReportSchema = new Schema<IReport>({
  title: { type: String, required: true },
  text: { type: String, required: true },
  createdBy: { type: String, required: true, index: true },
  location: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    address: { type: String },
  },
  mediaUrl: { type: String },
  anonymous: { type: Boolean, default: false },
  status: { type: String, enum: ['open', 'resolved'], default: 'open' },
  createdAt: { type: Date, default: Date.now },
})

ReportSchema.index({ createdAt: -1 })

export const Report = mongoose.model<IReport>('Report', ReportSchema)