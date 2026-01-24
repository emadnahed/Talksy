// @ts-check

/** @type {import('nextra').NextraConfig} */
const config = {
  theme: 'nextra-theme-docs',
  themeConfig: './theme.config.jsx',
  staticImage: true,
  flexsearch: {
    codeblocks: false
  },
  mdxOptions: {
    remarkPlugins: [],
    rehypePlugins: []
  },
  defaultShowCopyCode: true,
  documentDriven: false,
  main: null,
  banner: {
    key: 'nextra-banner',
    text: 'Talksy Documentation'
  }
}

module.exports = config