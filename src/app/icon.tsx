import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Raster favicon for browsers that prefer PNG over SVG. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0f14",
          borderRadius: 8,
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            border: "1.5px solid #5eead4",
            background: "#141b24",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            paddingLeft: 4,
            paddingRight: 4,
            gap: 2,
          }}
        >
          <div style={{ height: 2, width: 12, background: "#5eead4", borderRadius: 1 }} />
          <div style={{ height: 2, width: 9, background: "#38bdf8", borderRadius: 1 }} />
          <div style={{ height: 2, width: 11, background: "#f0ab7c", borderRadius: 1 }} />
        </div>
      </div>
    ),
    size,
  );
}
