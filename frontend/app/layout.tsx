import React from "react";
// Connects the Tailwind design engine to your whole app
import "./globals.css";

export const metadata = {
  title: "3D Product Preview Engine",
  description: "Generate 3D assets on the fly",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return React.createElement(
    "html",
    { lang: "en" },
    React.createElement("body", null, children)
  );
}