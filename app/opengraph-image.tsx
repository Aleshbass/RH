/**
 * Site-wide Open Graph image (1200x630), served at /opengraph-image.
 *
 * The root layout and lib/seo pageMetadata() point og:image at it, so it is the card WhatsApp,
 * X, LinkedIn and Facebook show for any page without its own image. No request data is read
 * and the default Node runtime is used, so Next renders it once at build time (static).
 * Text only, no emoji: emoji are fetched from a CDN at render time.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image
 */

import { ImageResponse } from 'next/og';
import { SITE_CONFIG } from '@/lib/seo/config';

export const alt = SITE_CONFIG.ogImageAlt;
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

const INK = '#0b1312';
const LIME = '#00cd0f';
const CANVAS = '#f4ede3';

const POINTS = ['Licensed physiotherapists', 'Online or in person', 'Secure payment by Paystack'];

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 80px',
          backgroundColor: INK,
          color: CANVAS,
        }}
      >
        {/* Brand line */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: LIME }} />
            <div style={{ display: 'flex', fontSize: '34px', fontWeight: 700, color: '#ffffff' }}>Physio Around Me</div>
            <div style={{ display: 'flex', fontSize: '30px', color: 'rgba(244, 237, 227, 0.6)' }}>by Rehabify Health</div>
          </div>
          <div style={{ display: 'flex', fontSize: '24px', color: 'rgba(244, 237, 227, 0.6)' }}>physioaroundme.com</div>
        </div>

        {/* Headline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div
            style={{
              display: 'flex',
              fontSize: '84px',
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              color: '#ffffff',
              maxWidth: '980px',
            }}
          >
            Book a Verified Physiotherapist
          </div>
          <div style={{ display: 'flex', fontSize: '32px', lineHeight: 1.35, color: 'rgba(244, 237, 227, 0.78)', maxWidth: '920px' }}>
            Online video sessions or in-person care at home or in clinic, across Nigeria.
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: '14px' }}>
          {POINTS.map((point, i) => (
            <div
              key={point}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 20px',
                borderRadius: '999px',
                // First point in green with ink text, the rest outlined
                backgroundColor: i === 0 ? LIME : 'transparent',
                border: i === 0 ? `2px solid ${LIME}` : '2px solid rgba(244, 237, 227, 0.18)',
                fontSize: '21px',
                fontWeight: i === 0 ? 700 : 400,
                color: i === 0 ? INK : CANVAS,
              }}
            >
              {point}
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
