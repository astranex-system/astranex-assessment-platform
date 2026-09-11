import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AstraNex Defence | Secure Technical Assessment Portal",
  description: "Production-grade technical evaluation platform for defense software engineers.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
          {children}
        </div>
      </body>
    </html>
  );
}
