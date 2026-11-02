import React from 'react';
import { Bell, Eye, LineChart, MessageCircle } from '@/components/icons';
import { WhatsApp } from '@/components/icons';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/utils';

export const metadata: Metadata = pageMetadata({
  title: 'Meet Joy, your recovery companion on WhatsApp',
  description: 'Joy is your AI recovery companion on WhatsApp. Daily exercise reminders, AI form correction, adherence tracking, and direct access to your physiotherapist.',
  path: '/meet-joy',
});

const WHATSAPP_PRE_MESSAGE = "Hi Joy! 👋🏾 I need help with my recovery.";
const WHATSAPP_URL = `https://wa.me/2348122615453?text=${encodeURIComponent(WHATSAPP_PRE_MESSAGE)}`;

export default function MeetJoyPage() {
  return (
    <main className="min-h-screen bg-[#FFCFDC]">
      {/* Hero */}
      <section className="w-full pt-32 sm:pt-40 pb-20 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
            {/* Left Content */}
            <div className="max-w-xl">
              <p className="text-sm font-bold tracking-widest text-gray-800 uppercase mb-4">Meet Joy</p>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-[1.1]">
                Your recovery companion on WhatsApp.
              </h1>
              <p className="text-lg md:text-xl text-gray-800 mb-10 leading-relaxed font-medium">
                Joy is with you every day between physio sessions. She reminds you to exercise, watches your form via your phone camera, answers your questions, and keeps your physiotherapist updated. All through WhatsApp, the app you already use.
              </p>

              <ul className="space-y-6 mb-10">
                <li className="flex items-start">
                  <Bell className="w-6 h-6 text-[#008069] mt-0.5 mr-4 flex-shrink-0" strokeWidth={2.5} />
                  <span className="text-gray-900 font-medium text-lg">Daily exercise reminders at a time that suits you</span>
                </li>
                <li className="flex items-start">
                  <Eye className="w-6 h-6 text-[#008069] mt-0.5 mr-4 flex-shrink-0" strokeWidth={2.5} />
                  <span className="text-gray-900 font-medium text-lg">AI form correction. Record yourself, Joy spots mistakes</span>
                </li>
                <li className="flex items-start">
                  <LineChart className="w-6 h-6 text-[#008069] mt-0.5 mr-4 flex-shrink-0" strokeWidth={2.5} />
                  <span className="text-gray-900 font-medium text-lg">Adherence tracking your physio can see in real time</span>
                </li>
                <li className="flex items-start">
                  <MessageCircle className="w-6 h-6 text-[#008069] mt-0.5 mr-4 flex-shrink-0" strokeWidth={2.5} />
                  <span className="text-gray-900 font-medium text-lg">Direct line to your physiotherapist and care team</span>
                </li>
                <li className="flex items-start">
                  <WhatsApp className="w-6 h-6 text-[#008069] mt-0.5 mr-4 flex-shrink-0" strokeWidth={2.5} />
                  <span className="text-gray-900 font-medium text-lg">No new app. Works entirely on WhatsApp</span>
                </li>
              </ul>

              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-3 bg-[#008069] hover:bg-[#006653] text-white font-bold text-lg py-4 px-10 rounded-full transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                <WhatsApp className="w-6 h-6" />
                Talk to Joy Now
              </a>
            </div>

            {/* Right Content - WhatsApp Mockup */}
            <div className="relative mx-auto w-full max-w-sm lg:max-w-md pt-8">
              <div className="bg-[#EFEAE2] rounded-[2rem] overflow-hidden shadow-2xl border-8 border-white/60 relative">
                
                {/* WhatsApp Header */}
                <div className="bg-[#008069] px-4 py-3 flex items-center gap-3 shadow-md relative z-10">
                  <div className="w-10 h-10 rounded-full bg-[#E8A54F] flex items-center justify-center text-white font-semibold text-lg flex-shrink-0">
                    J
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-[17px] leading-tight">Joy · Rehabify</h3>
                    <p className="text-white/90 text-[13px] font-medium">Online</p>
                  </div>
                </div>

                {/* Chat Body */}
                <div className="p-4 sm:p-5 space-y-4 bg-[#EFEAE2] h-[550px] overflow-y-auto">
                  {/* Message 1 */}
                  <div className="bg-white rounded-2xl rounded-tl-sm p-3 max-w-[85%] shadow-sm relative">
                    <p className="text-[#111b21] text-[15px] leading-snug">
                      Good morning Tunde 👋 Time for your back exercises. 3 sets today. Takes about 12 minutes.
                    </p>
                    <p className="text-[11px] text-gray-500 text-right mt-1.5 font-medium">8:02 AM</p>
                  </div>

                  {/* Message 2 (User) */}
                  <div className="bg-[#D9FDD3] rounded-2xl rounded-tr-sm p-3 max-w-[85%] ml-auto shadow-sm relative">
                    <p className="text-[#111b21] text-[15px] leading-snug">
                      Done! Should I send a video?
                    </p>
                    <p className="text-[11px] text-[#53bdeb] text-right mt-1.5 font-bold tracking-wider">8:18 AM ✓✓</p>
                  </div>

                  {/* Message 3 */}
                  <div className="bg-white rounded-2xl rounded-tl-sm p-3 max-w-[85%] shadow-sm relative">
                    <p className="text-[#111b21] text-[15px] leading-snug">
                      Yes please. Record your second set and send it here. I will check your form right away.
                    </p>
                    <p className="text-[11px] text-gray-500 text-right mt-1.5 font-medium">8:18 AM</p>
                  </div>

                  {/* Message 4 */}
                  <div className="bg-white rounded-2xl rounded-tl-sm p-3 max-w-[85%] shadow-sm relative">
                    <p className="text-[#111b21] text-[15px] leading-snug">
                      Great effort! One thing. Your left knee is rotating inward on the squat. Try turning your toes slightly outward. I have flagged this for Dr Adaeze to review too.
                    </p>
                    <p className="text-[11px] text-gray-500 text-right mt-1.5 font-medium">8:21 AM</p>
                  </div>

                  {/* Button Mockup inside chat */}
                  <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="block mt-6 mx-2">
                    <div className="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-xl p-3.5 text-center cursor-pointer hover:bg-white transition-colors shadow-sm">
                      <span className="text-[#111b21] font-bold text-[15px]">Book next session →</span>
                    </div>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
