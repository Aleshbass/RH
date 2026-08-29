import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const name = searchParams.get("name") || "Physiotherapist";
    const duration = searchParams.get("duration") || "60";
    const specialization = searchParams.get("spec") || "Physiotherapy";
    const imageUrl = searchParams.get("image") || "";

    // Generate initials for fallback avatar
    const initials = name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase();

    return new ImageResponse(
        (
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    width: "100%",
                    height: "100%",
                    backgroundColor: "#0a0a0a",
                    position: "relative",
                    overflow: "hidden",
                }}
            >
                {/* Background gradient accent */}
                <div
                    style={{
                        position: "absolute",
                        top: "-80px",
                        right: "-80px",
                        width: "400px",
                        height: "400px",
                        borderRadius: "50%",
                        background:
                            "radial-gradient(circle, rgba(20,184,166,0.15) 0%, transparent 70%)",
                        display: "flex",
                    }}
                />
                <div
                    style={{
                        position: "absolute",
                        bottom: "-60px",
                        left: "-60px",
                        width: "300px",
                        height: "300px",
                        borderRadius: "50%",
                        background:
                            "radial-gradient(circle, rgba(20,184,166,0.08) 0%, transparent 70%)",
                        display: "flex",
                    }}
                />

                {/* Main content area */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        flex: 1,
                        padding: "60px 80px 40px",
                        gap: "60px",
                    }}
                >
                    {/* Left: Profile image */}
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "16px",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                width: "180px",
                                height: "180px",
                                borderRadius: "50%",
                                overflow: "hidden",
                                border: "4px solid rgba(20,184,166,0.4)",
                                boxShadow: "0 0 40px rgba(20,184,166,0.15)",
                            }}
                        >
                            {imageUrl ? (
                                <img
                                    src={imageUrl}
                                    alt=""
                                    width={180}
                                    height={180}
                                    style={{
                                        objectFit: "cover",
                                        width: "100%",
                                        height: "100%",
                                    }}
                                />
                            ) : (
                                <div
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        backgroundColor: "#14b8a6",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        color: "white",
                                        fontWeight: "bold",
                                        fontSize: "56px",
                                        letterSpacing: "2px",
                                    }}
                                >
                                    {initials}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: Info */}
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "12px",
                            maxWidth: "600px",
                        }}
                    >
                        {/* Title */}
                        <div
                            style={{
                                fontSize: "22px",
                                color: "#14b8a6",
                                fontWeight: "600",
                                letterSpacing: "1px",
                                textTransform: "uppercase",
                            }}
                        >
                            Book a Session
                        </div>

                        {/* Name */}
                        <div
                            style={{
                                fontSize: "48px",
                                fontWeight: "800",
                                color: "white",
                                lineHeight: "1.1",
                            }}
                        >
                            {name}
                        </div>

                        {/* Specialization badge */}
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                marginTop: "4px",
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    backgroundColor: "rgba(20,184,166,0.12)",
                                    border: "1px solid rgba(20,184,166,0.25)",
                                    borderRadius: "20px",
                                    padding: "6px 16px",
                                }}
                            >
                                <span
                                    style={{
                                        fontSize: "18px",
                                        color: "#5eead4",
                                        fontWeight: "500",
                                    }}
                                >
                                    {specialization}
                                </span>
                            </div>
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    backgroundColor: "rgba(255,255,255,0.06)",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    borderRadius: "20px",
                                    padding: "6px 16px",
                                }}
                            >
                                <span
                                    style={{
                                        fontSize: "18px",
                                        color: "#9ca3af",
                                        fontWeight: "500",
                                    }}
                                >
                                    {duration} min
                                </span>
                            </div>
                        </div>

                        {/* CTA */}
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                marginTop: "12px",
                                backgroundColor: "#14b8a6",
                                borderRadius: "12px",
                                padding: "14px 28px",
                                width: "fit-content",
                            }}
                        >
                            <span
                                style={{
                                    fontSize: "20px",
                                    fontWeight: "700",
                                    color: "white",
                                }}
                            >
                                Book Appointment →
                            </span>
                        </div>
                    </div>
                </div>

                {/* Bottom bar */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "20px 80px",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                        }}
                    >
                        <span
                            style={{
                                fontSize: "20px",
                                fontWeight: "700",
                                color: "#14b8a6",
                            }}
                        >
                            Physio Around Me
                        </span>
                        <span
                            style={{
                                fontSize: "16px",
                                color: "#4b5563",
                            }}
                        >
                            by Rehabify Health
                        </span>
                    </div>
                    <span
                        style={{
                            fontSize: "16px",
                            color: "#6b7280",
                        }}
                    >
                        physioaroundme.com
                    </span>
                </div>
            </div>
        ),
        {
            width: 1200,
            height: 630,
        }
    );
}
