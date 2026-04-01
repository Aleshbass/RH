import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Physio Register | Browse Registered Physiotherapists',
    description: 'The Physio Register is a public directory of physiotherapists in Nigeria. Browse profiles, view MRTB licenses, and read peer reviews.',
};

export default function PhysioRegisterLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
