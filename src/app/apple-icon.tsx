import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** Apple touch icon — same studio viewport + prompt bars as the brand mark. */
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0b0f14',
        borderRadius: 40,
      }}
    >
      <div
        style={{
          width: 118,
          height: 118,
          borderRadius: 28,
          border: '3px solid #5eead4',
          background: '#141b24',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          paddingLeft: 22,
          paddingRight: 22,
          gap: 10,
        }}
      >
        <div style={{ height: 10, width: 64, background: '#5eead4', borderRadius: 5 }} />
        <div style={{ height: 10, width: 48, background: '#38bdf8', borderRadius: 5 }} />
        <div style={{ height: 10, width: 56, background: '#f0ab7c', borderRadius: 5 }} />
      </div>
    </div>,
    size
  );
}
