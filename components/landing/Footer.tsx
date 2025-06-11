import React from 'react';
import Image from 'next/image';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXTwitter, faLinkedin, faInstagram } from '@fortawesome/free-brands-svg-icons';

const Footer = () => {
  return (
    <footer className="bg-[#002e2c] text-white rounded-t-2xl">
      <div className="container mx-auto px-6 lg:px-8">
        {/* CTA Section */}
        <div className="py-12 text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">Ready to Elevate Your Practice?</h2>
          <p className="text-gray-300 mb-8 max-w-2xl mx-auto">Join hundreds of clinics and therapists who are streamlining their workflows and improving patient outcomes with Rehabify.</p>
          <div className="flex justify-center gap-4">
            <button className="bg-white text-[#005b57] font-bold py-3 px-6 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer">
              Get Started for Free
            </button>
            <button className="bg-transparent border border-white text-white font-bold py-3 px-6 rounded-lg hover:bg-white hover:text-[#005b57] transition-colors cursor-pointer">
              Book a Demo
            </button>
          </div>
        </div>

        {/* Links Section */}
        <div className="py-12 border-t border-gray-700 grid grid-cols-2 md:grid-cols-5 gap-8">
          <div className="col-span-2 md:col-span-1">
             <Image src="/logos/White MainRehabify.svg" width={150} height={40} alt="Rehabify Logo" className="object-contain mb-4" />
            <p className="text-gray-400">Revolutionizing physiotherapy through technology.</p>
          </div>
          <div>
            <h3 className="font-bold mb-4">Platform</h3>
            <ul>
              <li className="mb-2"><a href="#" className="text-gray-300 hover:text-white">Patient Management</a></li>
              <li className="mb-2"><a href="#" className="text-gray-300 hover:text-white">Exercise Library</a></li>
              <li className="mb-2"><a href="#" className="text-gray-300 hover:text-white">Telehealth</a></li>
              <li className="mb-2"><a href="#" className="text-gray-300 hover:text-white">Analytics</a></li>
            </ul>
          </div>
          <div>
            <h3 className="font-bold mb-4">Resources</h3>
            <ul>
              <li className="mb-2"><a href="/learn" className="text-gray-300 hover:text-white">Rehabify Learn</a></li>
              <li className="mb-2"><a href="#" className="text-gray-300 hover:text-white">Blog</a></li>
              <li className="mb-2"><a href="#" className="text-gray-300 hover:text-white">Case Studies</a></li>
              <li className="mb-2"><a href="#" className="text-gray-300 hover:text-white">Help Center</a></li>
            </ul>
          </div>
          <div>
            <h3 className="font-bold mb-4">Company</h3>
            <ul>
              <li className="mb-2"><a href="#" className="text-gray-300 hover:text-white">About Us</a></li>
              <li className="mb-2"><a href="#" className="text-gray-300 hover:text-white">Careers</a></li>
              <li className="mb-2"><a href="#" className="text-gray-300 hover:text-white">Contact</a></li>
            </ul>
          </div>
           <div>
            <h3 className="font-bold mb-4">Legal</h3>
            <ul>
              <li className="mb-2"><a href="#" className="text-gray-300 hover:text-white">Terms of Service</a></li>
              <li className="mb-2"><a href="#" className="text-gray-300 hover:text-white">Privacy Policy</a></li>
              <li className="mb-2"><a href="#" className="text-gray-300 hover:text-white">Cookie Policy</a></li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 py-6 border-t border-gray-700 flex flex-col sm:flex-row justify-between items-center">
          <p className="text-gray-400 text-sm">&copy; {new Date().getFullYear()} Rehabify. All rights reserved.</p>
          {/* Social Icons Placeholder */}
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
    </footer>
  );
};

export default Footer;
