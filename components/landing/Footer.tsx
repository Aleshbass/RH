"use client";

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { joyWhatsAppUrl } from '@/lib/joyWhatsApp';
import { useConsent } from '@/components/consent/ConsentProvider';
import { GENERAL_EMAIL, SUPPORT_EMAIL } from '@/lib/contact';

// Book a demo lives on the partners page (/partnerships) now
const Footer = () => {
  const { openSettings } = useConsent();
  return (
    <footer className="bg-rh-ink text-white rounded-t-[2rem]">
      <div className="container mx-auto px-6 lg:px-8">
        {/* CTA Section */}
        <div className="py-16 text-center">
          <h2 className="text-[36px] sm:text-5xl font-bold tracking-tight leading-tight mb-8 max-w-2xl mx-auto">Your first step to recovery starts here.</h2>
          <a
            href={joyWhatsAppUrl("Hi Joy! 👋🏾 I need help with my recovery.")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center rounded-full bg-rh-lime px-7 font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime focus-visible:ring-offset-2 focus-visible:ring-offset-rh-ink"
          >
            Start Your Recovery
          </a>
        </div>

        {/* Links Section */}
        <div className="py-12 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8">
          <div className="col-span-1 sm:col-span-2 md:col-span-3 lg:col-span-1">
            <Image src="/logos/White MainRehabify.svg" width={150} height={40} alt="Rehabify Logo" className="object-contain mb-4" />
            <p className="text-gray-400 text-sm">Revolutionizing physiotherapy through technology and seamless care pathways.</p>
          </div>
          <div>
            <h3 className="text-base font-semibold mb-4 text-white">Professionals</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/platform/physiotherapists" className="text-gray-300 hover:text-white transition-colors">For Physiotherapists</Link></li>
              <li><Link href="/platform/clinics" className="text-gray-300 hover:text-white transition-colors">For Clinics</Link></li>
              <li><Link href="/platform/doctors" className="text-gray-300 hover:text-white transition-colors">For Referring Doctors</Link></li>
              <li><Link href="/physio-register" className="text-gray-300 hover:text-white transition-colors">Physio Register</Link></li>
              <li><a href="https://docs.physioaroundme.com" className="text-gray-300 hover:text-white transition-colors">Integrations</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-base font-semibold mb-4 text-white">Partners</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="https://partners.physioaroundme.com" className="text-rh-lime hover:text-white font-medium transition-colors">
                  Partner Program →
                </a>
              </li>
              <li>
                <a href="https://partners.physioaroundme.com" className="text-gray-300 hover:text-white transition-colors">
                  Partner Portal
                </a>
              </li>
              <li>
                <Link href="/track" className="text-gray-300 hover:text-white transition-colors">
                  Track a Referral
                </Link>
              </li>
              <li>
                <Link href="/partners/mediloan" className="text-gray-300 hover:text-white transition-colors">
                  MediLoan by MyItura
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-base font-semibold mb-4 text-white">Developers</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="https://docs.physioaroundme.com" className="text-gray-300 hover:text-white transition-colors">
                  API Documentation
                </a>
              </li>
              <li>
                <a href="https://docs.physioaroundme.com/api-reference" className="text-gray-300 hover:text-white transition-colors">
                  API Reference
                </a>
              </li>
              <li>
                <a href="https://docs.physioaroundme.com/api-reference/partner-integration-v1" className="text-gray-300 hover:text-white transition-colors">
                  Integration Guide
                </a>
              </li>
              <li>
                <a href="https://api.physioaroundme.com" className="text-gray-300 hover:text-white transition-colors">
                  API Health
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-base font-semibold mb-4 text-white">Company</h3>
            <ul className="space-y-2 text-sm">
              <li><a href="/about" className="text-gray-300 hover:text-white transition-colors">About Us</a></li>
              <li><Link href="/careers" className="text-gray-300 hover:text-white transition-colors">Careers</Link></li>
              <li><a href="/meet-joy" className="text-gray-300 hover:text-white transition-colors">Meet Joy</a></li>
              <li><Link href="/pricing" className="text-gray-300 hover:text-white transition-colors">Pricing</Link></li>
              <li><Link href="/rehabify-access" className="text-gray-300 hover:text-white transition-colors">Rehabify Access</Link></li>
              <li><Link href="/pay-later" className="text-gray-300 hover:text-white transition-colors">Pay Later</Link></li>
              <li><a href="/learn" className="text-gray-300 hover:text-white transition-colors">Rehabify Learn</a></li>
              <li><Link href="/contact" className="text-gray-300 hover:text-white transition-colors">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-base font-semibold mb-4 text-white">Legal</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/terms-and-conditions" className="text-gray-300 hover:text-white transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/privacy-policy" className="text-gray-300 hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/cookie-policy" className="text-gray-300 hover:text-white transition-colors">
                  Cookie Policy
                </Link>
              </li>
              <li>
                <button type="button" onClick={openSettings} className="text-gray-300 hover:text-white transition-colors">
                  Cookie settings
                </button>
              </li>
              <li>
                <Link href="/payment-policy" className="text-gray-300 hover:text-white transition-colors">
                  Payment Policy
                </Link>
              </li>
              <li>
                <Link href="/consultation-booking-policy" className="text-gray-300 hover:text-white transition-colors">
                  Consultation &amp; Booking Policy
                </Link>
              </li>
              <li>
                <Link href="/payout-policy" className="text-gray-300 hover:text-white transition-colors">
                  Payout Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 py-6 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center">
          <p className="text-gray-400 text-sm">&copy; {new Date().getFullYear()} Rehabify. All rights reserved.</p>
          <p className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm sm:mt-0">
            <a href={`mailto:${GENERAL_EMAIL}`} className="text-gray-300 transition-colors hover:text-white">{GENERAL_EMAIL}</a>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gray-300 transition-colors hover:text-white">{SUPPORT_EMAIL}</a>
          </p>
          {/* Social links go here once the profiles exist (add them to SITE_CONFIG.organization.sameAs too) */}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
