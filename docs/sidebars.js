module.exports = {
  docs: [
    'getting-started',
    'overview',
    {
      type: 'category',
      label: 'Prompting',
      items: [
        'prompting/overview',
        'prompting/model-settings',
        'prompting/object-schema',
        'prompting/tools',
        'prompting/agents',
        'prompting/logic',
        'prompting/reusable-components',
      ],
    },
    {
      type: 'category',
      label: 'API',
      items: [
        'api/overview',
        'api/run-inference',
        'api/serialize-deserialize',
        'api/plugins',
        'api/utils',
      ],
    },
    'model-providers',
    'observability',
    'examples',
    'type-safety',
  ],
};   
