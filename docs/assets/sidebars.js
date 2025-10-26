/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
    docs: [
        {
            type: 'category',
            label: 'Getting Started',
            collapsed: false,
            items: ['index', 'use-cases', 'cookbook'],
        },
        {
            type: 'category',
            label: 'Core Concepts',
            items: ['models', 'fields', 'requests', 'mixins', 'inheritance'],
        },
        {
            type: 'category',
            label: 'Advanced',
            items: ['custom-fields', 'filtering'],
        },
    ],
};

module.exports = sidebars;
