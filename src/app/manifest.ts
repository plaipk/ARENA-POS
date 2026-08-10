import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ARENA POS Pro",
    short_name: "ARENA POS",
    description: "ระบบขายหน้าร้านและบัญชีสนามฟุตบอล",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f6f9",
    theme_color: "#4f46e5",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png" },
    ],
  };
}
