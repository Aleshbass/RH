export default function VideoCallLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Minimal layout for video calls - no header, no footer, full screen
    return (
        <div className="min-h-screen bg-gray-900">
            {children}
        </div>
    );
}
