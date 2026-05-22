import type { UIStrings } from "../types";

export default {
  nav: {
    home: "Home",
    posts: "Articles",
    tags: "Topics",
    about: "About",
    archives: "Archives",
    search: "Search",
  },
  post: {
    publishedAt: "Published",
    updatedAt: "Updated",
    sharePostIntro: "Share this guide:",
    sharePostOn: "Share this post on {{platform}}",
    sharePostViaEmail: "Share this post via email",
    tagLabel: "Topics",
    backToTop: "Back to top",
    goBack: "Go back",
    editPage: "Edit page",
    previousPost: "Previous Article",
    nextPost: "Next Article",
  },
  pagination: {
    prev: "Prev",
    next: "Next",
    page: "Page",
  },
  home: {
    socialLinks: "Follow Us",
    featured: "Featured Guides",
    recentPosts: "Latest Articles",
    allPosts: "Browse All Articles",
  },
  footer: {
    copyright: "Copyright",
    allRightsReserved: "All rights reserved.",
  },
  pages: {
    tagTitle: "Topic",
    tagDesc: "All travel guides tagged with",

    tagsTitle: "Topics",
    tagsDesc: "Browse guides by topic — destinations, food, culture, and more.",

    postsTitle: "Travel Guides & Articles",
    postsDesc: "In-depth guides, tips, and stories for your China adventure.",

    archivesTitle: "Archives",
    archivesDesc: "All articles, sorted by date.",

    searchTitle: "Search",
    searchDesc: "Search guides, destinations, tips...",
  },
  a11y: {
    skipToContent: "Skip to content",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    toggleTheme: "Toggle theme",
    searchPlaceholder: "Search guides, cities, tips...",
    noResults: "No results found",
    goToPreviousPage: "Go to previous page",
    goToNextPage: "Go to next page",
  },
  notFound: {
    title: "404 Not Found",
    message: "Page Not Found",
    goHome: "Go back home",
  },
} satisfies UIStrings;
