"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXTwitter, faLinkedin, faInstagram } from '@fortawesome/free-brands-svg-icons';
import BookDemoModal from './BookDemoModal';

const Footer = () => {
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);

  return (
    <footer className="bg-[#002e2c] text-white rounded-t-2xl">
      <div className="container mx-auto px-6 lg:px-8">
        {/* CTA Section */}
        <div className="py-12 text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">Start Your Recovery Journey Now</h2>
          <p className="text-gray-300 mb-8 max-w-2xl mx-auto">No more choosing between health and finances. No more waiting weeks. No more wondering if you found the right physiotherapist.</p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a href={`https://wa.me/2348061525811?text=${encodeURIComponent("Hi Joy! 👋🏾 I need help with my recovery.")}`} target="_blank" rel="noopener noreferrer">
              <button className="bg-white text-[#005b57] font-bold py-3 px-6 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer">
                Start Your Recovery
              </button>
            </a>
            <button
              onClick={() => setIsDemoModalOpen(true)}
              className="bg-transparent border border-white text-white font-bold py-3 px-6 rounded-lg hover:bg-white hover:text-[#005b57] transition-colors cursor-pointer"
            >
              Book a Demo
            </button>
          </div>
          <p className="text-gray-400 text-sm mt-6">Trusted by 500+ patients. Verified by medical professionals.</p>
        </div>

        {/* Links Section */}
        <div className="py-12 border-t border-gray-700 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8">
          <div className="col-span-1 sm:col-span-2 md:col-span-3 lg:col-span-1">
            <Image src="/logos/White MainRehabify.svg" width={150} height={40} alt="Rehabify Logo" className="object-contain mb-4" />
            <p className="text-gray-400 text-sm">Revolutionizing physiotherapy through technology and seamless care pathways.</p>
          </div>
          <div>
            <h3 className="font-bold mb-4 text-white">Professionals</h3>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="text-gray-300 hover:text-white transition-colors">Patient Management</a></li>
              <li><a href="#" className="text-gray-300 hover:text-white transition-colors">Exercise Library</a></li>
              <li><a href="#" className="text-gray-300 hover:text-white transition-colors">Telehealth</a></li>
              <li><a href="#" className="text-gray-300 hover:text-white transition-colors">Analytics</a></li>
              <li><Link href="/integrations" className="text-gray-300 hover:text-white transition-colors">Integrations</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-bold mb-4 text-white">Partners</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/partnerships" className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
                  Partner Program →
                </Link>
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
            <h3 className="font-bold mb-4 text-white">Developers</h3>
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
            <h3 className="font-bold mb-4 text-white">Company</h3>
            <ul className="space-y-2 text-sm">
              <li><a href="/about" className="text-gray-300 hover:text-white transition-colors">About Us</a></li>
              <li><a href="/learn" className="text-gray-300 hover:text-white transition-colors">Rehabify Learn</a></li>
              <li><a href="#" className="text-gray-300 hover:text-white transition-colors">Careers</a></li>
              <li><a href="#" className="text-gray-300 hover:text-white transition-colors">Contact</a></li>
            </ul>
          </div>
          <div>
            <h3 className="font-bold mb-4 text-white">Legal</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/terms-and-conditions" className="text-gray-300 hover:text-white transition-colors">
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link href="/privacy-policy" className="text-gray-300 hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/payment-policy" className="text-gray-300 hover:text-white transition-colors">
                  Payment Policy
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
        <div className="mt-8 py-6 border-t border-gray-700 flex flex-col sm:flex-row justify-between items-center">
          <p className="text-gray-400 text-sm">&copy; {new Date().getFullYear()} Rehabify. All rights reserved.</p>
          {/* Social Icons */}
          <div className="flex space-x-6 mt-4 sm:mt-0">
            <a href="#" aria-label="X" className="text-gray-400 hover:text-white transition-colors">
              <FontAwesomeIcon icon={faXTwitter} size="lg" />
            </a>
            <a href="#" aria-label="LinkedIn" className="text-gray-400 hover:text-white transition-colors">
              <FontAwesomeIcon icon={faLinkedin} size="lg" />
            </a>
            <a href="#" aria-label="Instagram" className="text-gray-400 hover:text-white transition-colors">
              <FontAwesomeIcon icon={faInstagram} size="lg" />
            </a>
          </div>
        </div>
      </div>

      {/* Book Demo Modal */}
      <BookDemoModal
        isOpen={isDemoModalOpen}
        onClose={() => setIsDemoModalOpen(false)}
      />
    </footer>
  );
};

export default Footer;
