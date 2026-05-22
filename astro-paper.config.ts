import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: {
    url: "https://roamchinatravel.com/",
    title: "Roam China Travel",
    description:
      "Your ultimate guide to traveling China — visa tips, payment hacks, must-see destinations, and authentic travel stories for international visitors.",
    author: "Roam China Travel Editorial Team",
    profile: "https://roamchinatravel.com/about",
    ogImage: "default-og.jpg",
    lang: "en",
    timezone: "Asia/Shanghai",
    dir: "ltr",
  },
  posts: {
    perPage: 6,
    perIndex: 6,
    scheduledPostMargin: 15 * 60 * 1000,
  },
  features: {
    lightAndDarkMode: true,
    dynamicOgImage: true,
    showArchives: true,
    showBackButton: true,
    editPost: {
      enabled: false,
    },
    search: "pagefind",
  },
  socials: [
    { name: "x",        url: "https://x.com/roamchinatravel" },
    { name: "facebook", url: "https://www.facebook.com/roamchinatravel" },
    { name: "pinterest", url: "https://www.pinterest.com/roamchinatravel" },
    { name: "mail",     url: "mailto:hello@roamchinatravel.com" },
  ],
  shareLinks: [
    { name: "whatsapp", url: "https://wa.me/?text=" },
    { name: "facebook", url: "https://www.facebook.com/sharer.php?u=" },
    { name: "x",        url: "https://x.com/intent/post?url=" },
    { name: "telegram", url: "https://t.me/share/url?url=" },
    { name: "pinterest", url: "https://pinterest.com/pin/create/button/?url=" },
    { name: "mail",     url: "mailto:?subject=Roam%20China%20Travel%20Guide&body=" },
  ],
});
