import { ImageResponse } from "next/og";

/** PWA/"add to home screen" icon (512x512) — referenced from manifest.ts. */
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
          fontSize: 320,
        }}
      >
        ⚽
      </div>
    ),
    { width: 512, height: 512 },
  );
}
