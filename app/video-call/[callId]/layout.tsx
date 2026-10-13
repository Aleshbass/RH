import { Toaster } from 'sonner'

export default function VideoCallLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Minimal full-screen layout for calls: no site header or footer.
    return (
        <div className="min-h-[100dvh] bg-[#f5f6f5]">
            {children}
            <Toaster position="top-center" />
        </div>
    );
}
