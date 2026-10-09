import type { Metadata } from "next";
import { Raleway } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const raleway = Raleway({
  variable: "--font-raleway",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MRO - Controle de FTE",
  description: "Sistema web de controle de FTEs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${raleway.variable} font-sans h-full antialiased`}
    >
      <body className="min-h-full flex flex-col md:flex-row bg-slate-50 text-slate-900 font-sans">
        <Sidebar />
        <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}
