import mongoose, { Schema, Document } from 'mongoose'

export interface ICommunity extends Document {
  name: string
  description: string
  createdBy: string
  members: string[]
  joinRequests: { userId: string; status: 'pending' | 'accepted' | 'rejected'; requestedAt: Date }[]
  isPublic: boolean
  isGlobal: boolean
  createdAt: Date
  updatedAt: Date
}

const CommunitySchema = new Schema<ICommunity>({
  name: { type: String, required: true, index: true },
  description: { type: String, default: '' },
  createdBy: { type: String, required: true, index: true },
  members: { type: [String], default: [] },
  joinRequests: {
    type: [{
      userId: { type: String, required: true },
      status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
      requestedAt: { type: Date, default: Date.now },
    }],
    default: [],
  },
  isPublic: { type: Boolean, default: true },
  isGlobal: { type: Boolean, default: false },
}, { timestamps: true })

export const Community = mongoose.model<ICommunity>('Community', CommunitySchema)
