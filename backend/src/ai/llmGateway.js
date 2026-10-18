const env = require('../config/env');

// Provider-agnostic gateway (PDR Part 10). To add another provider, create a file in
// ./providers that exports { name, complete({ system, user, meta }) } and register it here.
const providers = {
  anthropic: require('./providers/anthropicProvider'),
  mock: require('./providers/mockProvider'),
};

function info() {
  return {
    provider: env.LLM_PROVIDER,
    model: env.LLM_PROVIDER === 'mock' ? 'demo-mock-1' : env.LLM_MODEL || 'unconfigured',
  };
}

async function complete(args) {
  const provider = providers[env.LLM_PROVIDER];
  if (!provider) throw new Error(`Unknown LLM_PROVIDER "${env.LLM_PROVIDER}". Use "anthropic" or "mock".`);
  return provider.complete(args);
}

module.exports = { info, complete };






