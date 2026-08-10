import { ImageResponse } from "next/og";

/** PWA/"add to home screen" icon (192x192) — referenced from manifest.ts.
 * A dedicated route (not the `icon`/`apple-icon` file convention) so it has
 * a stable URL the manifest's `icons` array can point to directly. */
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#4f46e5",
          fontSize: 120,
        }}
      >
        ⚽
      </div>
    ),
    { width: 192, height: 192 },
  );
}
