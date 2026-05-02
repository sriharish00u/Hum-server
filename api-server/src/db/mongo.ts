import mongoose from 'mongoose'
import { logger } from '../lib/logger'

export async function connectDB(): Promise<void> {
  const url = process.env.MONGO_URL
  if (!url) {
    logger.error('MONGO_URL environment variable is not set')
    process.exit(1)
  }
  try {
    await mongoose.connect(url)
    logger.info('MongoDB connected successfully')
  } catch (err) {
    logger.error({ err }, 'MongoDB connection failed')
    process.exit(1)
  }
}