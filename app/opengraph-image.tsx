/**
 * Static Open Graph Image for Homepage
 * 
 * Next.js automatically uses this for og:image meta tags
 * This provides a consistent, branded OG image for the homepage
 * 
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image
 */

import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Rehabify Health - AI-Powered Physical Therapy Platform';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          position: 'relative',
          backgroundColor: '#005b57',
        }}
      >
        {/* Background gradient overlay */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(135deg, rgba(0, 91, 87, 0.95) 0%, rgba(0, 135, 126, 0.85) 100%)',
            display: 'flex',
          }}
        />

        {/* Decorative elements (platform-inspired) */}
        <div
          style={{
            position: 'absolute',
            top: '-100px',
            right: '-100px',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.08)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-80px',
            left: '-80px',
            width: '300px',
            height: '300px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.06)',
            display: 'flex',
          }}
        />

        {/* Main content container */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            padding: '60px 80px',
            justifyContent: 'space-between',
          }}
        >
          {/* Header with logo/brand */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div
              style={{
                fontSize: '72px',
                fontWeight: 'bold',
                color: '#ffffff',
                letterSpacing: '-0.03em',
                display: 'flex',
                textShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
              }}
            >
              Rehabify Health
            </div>
            <div
              style={{
                fontSize: '24px',
                color: 'rgba(255, 255, 255, 0.9)',
                fontWeight: '500',
                display: 'flex',
                letterSpacing: '0.5px',
              }}
            >
              AI-Powered Physiotherapy Platform
            </div>
          </div>

          {/* Main title content */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
              flex: 1,
              justifyContent: 'center',
              maxWidth: '900px',
            }}
          >
            <div
              style={{
                fontSize: '52px',
                fontWeight: 'bold',
                color: '#ffffff',
                lineHeight: 1.2,
                display: 'flex',
                textShadow: '0 2px 15px rgba(0, 0, 0, 0.3)',
              }}
            >
              Connect with Licensed Physiotherapists Online
            </div>

            <div
              style={{
                fontSize: '26px',
                color: 'rgba(255, 255, 255, 0.85)',
                lineHeight: 1.4,
                display: 'flex',
              }}
            >
              Personalized treatment plans • AI exercise monitoring • Telehealth appointments
            </div>
          </div>

          {/* Footer with features/badges */}
          <div
            style={{
              display: 'flex',
              gap: '40px',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                padding: '12px 24px',
                borderRadius: '50px',
                backdropFilter: 'blur(10px)',
              }}
            >
              <div style={{ fontSize: '24px', display: 'flex' }}>🏥</div>
              <div
                style={{
                  fontSize: '18px',
                  color: '#ffffff',
                  fontWeight: '600',
                  display: 'flex',
                }}
              >
                Licensed Physiotherapists
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                padding: '12px 24px',
                borderRadius: '50px',
                backdropFilter: 'blur(10px)',
              }}
            >
              <div style={{ fontSize: '24px', display: 'flex' }}>🤖</div>
              <div
                style={{
                  fontSize: '18px',
                  color: '#ffffff',
                  fontWeight: '600',
                  display: 'flex',
                }}
              >
                AI Exercise Monitoring
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                padding: '12px 24px',
                borderRadius: '50px',
                backdropFilter: 'blur(10px)',
              }}
            >
              <div style={{ fontSize: '24px', display: 'flex' }}>📱</div>
              <div
                style={{
                  fontSize: '18px',
                  color: '#ffffff',
                  fontWeight: '600',
                  display: 'flex',
                }}
              >
                Telehealth Ready
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
