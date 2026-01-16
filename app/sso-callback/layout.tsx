export default function SSOCallbackLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Minimal layout - no header/footer during SSO processing
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#e8f5f4] to-white">
            {children}
        </div>
    );
}
