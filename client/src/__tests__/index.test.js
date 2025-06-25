const request = require('supertest');
const express = require('express');
const bodyParser = require('body-parser');
const db = require('../mysql_connect');

jest.mock('../mysql_connect');

const app = express();
app.use(bodyParser.json());
app.post('/ownercomplaints', async (req, res) => {
  const { userId } = req.body;
  try {
    const numericId = parseInt(userId.split('-')[1]);
    const result = await db.ownercomplaints(numericId);
    res.send(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

describe('POST /ownercomplaints', () => {
  beforeEach(() => {
    db.ownercomplaints.mockReset();
  });

  test('returns complaints for valid userId', async () => {
    const mockData = [
      { room_no: 101, complaints: 'Leaky faucet', resolved: false },
      { room_no: 102, complaints: 'Broken window', resolved: false },
    ];
    db.ownercomplaints.mockResolvedValue(mockData);

    const response = await request(app)
      .post('/ownercomplaints')
      .send({ userId: 'o-123' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockData);
    expect(db.ownercomplaints).toHaveBeenCalledWith(123);
  });

  test('returns 400 for missing userId', async () => {
    const response = await request(app)
      .post('/ownercomplaints')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Missing userId in request body' });
  });

  test('returns 500 for database error', async () => {
    db.ownercomplaints.mockRejectedValue(new Error('Database error'));

    const response = await request(app)
      .post('/ownercomplaints')
      .send({ userId: 'o-123' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Erreur serveur: Database error' });
  });
});