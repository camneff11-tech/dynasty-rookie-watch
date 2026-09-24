import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";

const body = Barlow({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });
const display = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-display" });

export const metadata = {
  title: "Dynasty Rookie Watch · 2027 Class",
  description: "Weekly and season-to-date fantasy production for 2027 NFL draft prospects, pulled live from ESPN.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
