import { Font } from "@react-pdf/renderer";

let registered = false;

/**
 * The original relied on Google's built-in PDF converter having Thai fonts baked in
 * (HtmlService -> PDF). react-pdf renders from scratch and needs a font registered
 * explicitly, so we pull Noto Sans Thai straight from Google Fonts' static CDN —
 * these URLs are version-pinned and effectively permanent. Call this once per
 * lambda before rendering; safe to call repeatedly (no-ops after the first call).
 */
export function registerThaiFonts() {
  if (registered) return;
  Font.register({
    family: "Noto Sans Thai",
    fonts: [
      {
        src: "https://fonts.gstatic.com/s/notosansthai/v29/iJWnBXeUZi_OHPqn4wq6hQ2_hbJ1xyN9wd43SofNWcd1MKVQt_So_9CdU5RtpzE.ttf",
        fontWeight: 400,
      },
      {
        src: "https://fonts.gstatic.com/s/notosansthai/v29/iJWnBXeUZi_OHPqn4wq6hQ2_hbJ1xyN9wd43SofNWcd1MKVQt_So_9CdU3NqpzE.ttf",
        fontWeight: 700,
      },
    ],
  });
  registered = true;
}
