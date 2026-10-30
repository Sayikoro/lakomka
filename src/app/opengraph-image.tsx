import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

export const runtime = "nodejs"; // edge не поддерживается статическим экспортом (деплой), next/og работает и в Node
export const dynamic = "force-static"; // требуется для output: export — OG-картинка генерируется один раз при сборке
export const alt = "Лакомка — новогодние подарки";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #0a0a0a 0%, #2a1a0a 100%)",
          color: "white",
          fontFamily: "sans-serif",
          padding: "60px",
        }}
      >
        <div style={{ fontSize: 32, letterSpacing: 8, textTransform: "uppercase", opacity: 0.9 }}>
          Новогодняя коллекция
        </div>
        <div style={{ fontSize: 140, fontWeight: 700, marginTop: 20 }}>2027</div>
        <div style={{ fontSize: 48, marginTop: 40, fontWeight: 600 }}>{SITE.name}</div>
        <div style={{ fontSize: 28, marginTop: 20, opacity: 0.85 }}>
          Подарки и наборы конфет · Хабаровск
        </div>
      </div>
    ),
    { ...size }
  );
}