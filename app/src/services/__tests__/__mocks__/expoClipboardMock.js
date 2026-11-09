let clipboard = '';
module.exports = {
  setStringAsync: jest.fn(async (text) => {
    clipboard = text;
    return true;
  }),
  getStringAsync: jest.fn(async () => clipboard),
};

