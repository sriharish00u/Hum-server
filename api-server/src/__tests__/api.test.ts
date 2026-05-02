import request from 'supertest';
import app from '../app';
import { User } from '../models/user.model';

jest.mock('../models/user.model', () => ({
  User: {
    findOneAndUpdate: jest.fn().mockResolvedValue({
      deviceId: 'dev_test_123',
      name: 'Test User',
      avatarId: 1,
      reputation: 0,
      alertsHandled: 0,
      reportsSubmitted: 0,
      activitiesJoined: 0,
      impactPoints: 0,
    }),
    findOne: jest.fn().mockResolvedValue(null),
  },
}));

describe('API Routes', () => {
  describe('Auth Routes (/api/auth/device)', () => {
    it('POST /api/auth/device with valid deviceId returns 200 and user object', async () => {
      const res = await request(app)
        .post('/api/auth/device')
        .send({ deviceId: 'dev_test_123' });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toHaveProperty('deviceId', 'dev_test_123');
    });

    it('POST /api/auth/device with missing deviceId returns 400', async () => {
      const res = await request(app)
        .post('/api/auth/device')
        .send({});
      expect(res.statusCode).toEqual(400);
    });

    it('PATCH /api/auth/device with valid x-device-id header and name returns 200', async () => {
      const res = await request(app)
        .patch('/api/auth/device')
        .set('x-device-id', 'dev_test_123')
        .send({ name: 'Jay' });
      expect(res.statusCode).toEqual(200);
    });

    it('PATCH /api/auth/device with missing x-device-id header returns 401', async () => {
      const res = await request(app)
        .patch('/api/auth/device')
        .send({ name: 'Jay' });
      expect(res.statusCode).toEqual(401);
    });

    it('PATCH /api/auth/device with name shorter than 2 chars returns 400', async () => {
      const res = await request(app)
        .patch('/api/auth/device')
        .set('x-device-id', 'dev_test_123')
        .send({ name: 'J' });
      expect(res.statusCode).toEqual(400);
    });
  });

  describe('Data Routes', () => {
    it('GET /api/reports returns 200 and array', async () => {
      const res = await request(app).get('/api/reports');
      expect(res.statusCode).toEqual(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /api/reports without x-device-id header returns 401', async () => {
      const res = await request(app)
        .post('/api/reports')
        .send({
          title: 'Test Report',
          description: 'Test Description',
          location: { lat: 1, lng: 1 },
        });
      expect(res.statusCode).toEqual(401);
    });

    it('POST /api/reports with x-device-id header and valid body returns 200', async () => {
      const res = await request(app)
        .post('/api/reports')
        .set('x-device-id', 'dev_test_123')
        .send({
          title: 'Test Report',
          description: 'Test Description',
          location: { lat: 1, lng: 1 },
        });
      expect(res.statusCode).toEqual(200);
    });

    it('GET /api/activities returns 200 and array', async () => {
      const res = await request(app).get('/api/activities');
      expect(res.statusCode).toEqual(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /api/activities/:id/join without x-device-id returns 401', async () => {
      const res = await request(app).post('/api/activities/12345/join');
      expect(res.statusCode).toEqual(401);
    });
  });

  describe('Health', () => {
    it('GET /api/healthz returns 200 with status ok', async () => {
      const res = await request(app).get('/api/healthz');
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('status', 'ok');
    });
  });
});