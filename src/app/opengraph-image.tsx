import { ImageResponse } from "next/og";

export const alt = "活字 Huozi — 以文载道，活字为器";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#faf8f3",
        }}
      >
        {/* Main character */}
        <div
          style={{
            fontSize: "280px",
            fontWeight: 700,
            color: "#c4594a",
            lineHeight: 1,
          }}
        >
          字
        </div>

        {/* Decorative divider */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "24px",
            marginTop: "20px",
          }}
        >
          <div
            style={{
              width: "80px",
              height: "1px",
              backgroundColor: "#e6dfd2",
            }}
          />
          <div
            style={{
              fontSize: "24px",
              color: "#c4594a",
            }}
          >
            文
          </div>
          <div
            style={{
              width: "80px",
              height: "1px",
              backgroundColor: "#e6dfd2",
            }}
          />
        </div>

        {/* Site name */}
        <div
          style={{
            fontSize: "32px",
            color: "#9c9183",
            marginTop: "32px",
            letterSpacing: "0.15em",
          }}
        >
          huozi.app
        </div>
      </div>
    ),
    { ...size }
  );
}
