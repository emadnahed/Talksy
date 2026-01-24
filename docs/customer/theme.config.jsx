import React from 'react'

/** @type {import('nextra-theme-docs').DocsThemeConfig} */
export default {
  logo: <span>Talksy Documentation</span>,
  project: {
    link: 'https://github.com/your-organization/talksy'
  },
  chat: {
    link: 'https://discord.gg/talksy' // Replace with your actual Discord link
  },
  docsRepositoryBase: 'https://github.com/your-organization/talksy/tree/main/docs',
  footer: {
    text: 'MIT 2023 © Talksy',
  },
  useNextSeoProps() {
    return {
      titleTemplate: '%s – Talksy Documentation'
    }
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta property="og:title" content="Talksy Documentation" />
      <meta property="og:description" content="Official documentation for Talksy, a real-time AI assistant backend" />
    </>
  )
}