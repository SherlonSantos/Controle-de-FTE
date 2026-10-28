import type { Metadata } from "next";
import { Raleway } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { ThemeProvider } from "@/context/ThemeContext";

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
      suppressHydrationWarning
      className={`${raleway.variable} font-sans h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col md:flex-row bg-slate-50 text-slate-900 dark:bg-[#0a0f1d] dark:text-white font-sans transition-colors duration-200">
        <ThemeProvider>
          <Sidebar />
          <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
