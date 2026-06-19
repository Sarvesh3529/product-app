import React from "react";
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
    { lang: "en", className: "h-full w-full m-0 p-0 overflow-hidden" },
    React.createElement("body", { className: "h-full w-full m-0 p-0 bg-[#020202]" }, children)
  );
}