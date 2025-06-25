const mockQuery = jest.fn();
module.exports = {
  createConnection: jest.fn(() => ({
    query: mockQuery,
    on: jest.fn(),
  })),
  promise: () => ({
    createConnection: jest.fn(() => ({
      query: mockQuery,
      on: jest.fn(),
    })),
  }),
};