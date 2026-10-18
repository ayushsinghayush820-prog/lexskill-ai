// Honest default when no legal source is connected: nothing is ever marked VERIFIED.
module.exports = {
  name: 'none',
  isMock: false,
  async verify() {
    return {
      status: 'CANNOT_CHECK',
      normalized: null,
      sourceExcerpt: null,
      note: 'No legal source is connected. Verify this authority manually.',
    };
  },
};