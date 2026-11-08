const store = new Map();
const asyncStorage = {
  getItem: jest.fn(async (key) => store.get(key) ?? null),
  setItem: jest.fn(async (key, value) => {
    store.set(key, String(value));
  }),
  removeItem: jest.fn(async (key) => {
    store.delete(key);
  }),
  clear: jest.fn(async () => {
    store.clear();
  }),
};

module.exports = {
  ...asyncStorage,
  default: asyncStorage,
};
