// @ts-check

const config = {
  title: 'NormalJS ORM',
  tagline: 'Lightweight Node.js ORM with active records on Knex',
  url: 'https://ichiriac.github.io',
  baseUrl: '/normaljs/',
  favicon: 'img/favicon.ico',
  organizationName: 'ichiriac',
  projectName: 'normal',
  trailingSlash: false,
  i18n: { defaultLocale: 'en', locales: ['en'] },
  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */ ({
        docs: {
          routeBasePath: '/',
          sidebarPath: require.resolve('./docs/assets/sidebars.js'),
          editUrl: 'https://github.com/ichiriac/normaljs/edit/master/',
        },
        blog: false,
        theme: { customCss: require.resolve('./docs/assets/custom.css') },
      }),
    ],
  ],
  themeConfig: /** @type {import('@docusaurus/preset-classic').ThemeConfig} */ ({
    image: 'img/social-card.png',
    navbar: {
      title: 'NormalJS ORM',
      items: [
        { to: '/', label: 'Docs', position: 'left' },
        { href: 'https://github.com/ichiriac/normaljs', label: 'GitHub', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Getting started', to: '/' },
            { label: 'Cookbook', to: '/cookbook' },
          ],
        },
        {
          title: 'Community',
          items: [{ label: 'GitHub', href: 'https://github.com/ichiriac/normaljs' }],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Normal ORM.`,
    },
    prism: {
      theme: require('prism-react-renderer').themes.github,
      darkTheme: require('prism-react-renderer').themes.dracula,
    },
  }),
};

module.exports = config;
