/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docs: [
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: ['index', 'use-cases', 'cookbook', 'adoption-sequelize'],
    },
    {
      type: 'category',
      label: 'Core Concepts',
      items: ['models', 'fields', 'requests', 'filtering', 'mixins', 'inheritance'],
    },
    {
      type: 'category',
      label: 'Advanced',
      items: ['cache', 'transactions', 'hooks', 'custom-fields', 'relational-filters'],
    },
  ],
};

module.exports = sidebars;
