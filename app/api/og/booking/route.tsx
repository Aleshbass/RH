import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const name = searchParams.get("name") || "Physiotherapist";
    const duration = searchParams.get("duration") || "60";
    const specialization = searchParams.get("spec") || "Physiotherapy";
    const imageUrl = searchParams.get("image") || "";

    return new ImageResponse(
        (
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    height: "100%",
                    backgroundColor: "#121212",
                    padding: "40px",
                }}
            >
                {/* Logo and User */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        marginBottom: "24px",
                    }}
                >
                    <span
                        style={{
                            fontSize: "28px",
                            fontWeight: "700",
                            color: "#14b8a6",
                        }}
                    >
                        Rehabify
                    </span>
                    <span style={{ color: "#4a4a4a", fontSize: "28px" }}>/</span>
                    {imageUrl ? (
                        <img
                            src={imageUrl}
                            alt=""
                            width={50}
                            height={50}
                            style={{ borderRadius: "50%", objectFit: "cover" }}
                        />
                    ) : (
                        <div
                            style={{
                                width: "50px",
                                height: "50px",
                                borderRadius: "50%",
                                backgroundColor: "#14b8a6",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "white",
                                fontWeight: "bold",
                                fontSize: "20px",
                            }}
                        >
                            {name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")}
                        </div>
                    )}
                </div>

                {/* Name */}
                <div
                    style={{
                        fontSize: "24px",
                        color: "#9ca3af",
                        marginBottom: "8px",
                    }}
                >
                    Meet {name}
                </div>

                {/* Session Info */}
                <div
                    style={{
                        fontSize: "32px",
                        fontWeight: "700",
                        color: "white",
                        marginBottom: "16px",
                    }}
                >
                    {duration} Min Session
                </div>

                {/* Specialization */}
                <div
                    style={{
                        fontSize: "18px",
                        color: "#6b7280",
                    }}
                >
                    {specialization}
                </div>
            </div>
        ),
        {
            width: 1200,
            height: 630,
        }
    );
}
