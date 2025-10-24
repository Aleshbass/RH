/**
 * Open Graph Image Generator
 * 
 * Dynamically generates OG images for social media sharing
 * Uses RehabifyHealth branding with platform-inspired design
 * 
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image
 */

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Get query parameters
    const title = searchParams.get('title') || 'Rehabify Health';
    const description = searchParams.get('description') || 
      'AI-Powered Physical Therapy & Rehabilitation Platform';

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
                  fontSize: '56px',
                  fontWeight: 'bold',
                  color: '#ffffff',
                  lineHeight: 1.2,
                  display: 'flex',
                  textShadow: '0 2px 15px rgba(0, 0, 0, 0.3)',
                }}
              >
                {title}
              </div>

              {description && (
                <div
                  style={{
                    fontSize: '28px',
                    color: 'rgba(255, 255, 255, 0.85)',
                    lineHeight: 1.4,
                    display: 'flex',
                  }}
                >
                  {description}
                </div>
              )}
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
        width: 1200,
        height: 630,
      }
    );
  } catch (error) {
    console.error('Error generating OG image:', error);
    
    // Return a simple fallback
    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#005b57',
            color: '#fff',
            fontSize: '64px',
            fontWeight: 'bold',
          }}
        >
          Rehabify Health
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  }
}
