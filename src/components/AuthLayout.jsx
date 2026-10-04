import React from "react";
import { LogoMark } from "@/components/Logo";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="relative inline-flex mb-4">
            <LogoMark className="w-14 h-14 drop-shadow-sm" />
            {Icon && (
              <span className="absolute -bottom-1.5 -right-1.5 inline-flex items-center justify-center w-6 h-6 rounded-full bg-white border border-border shadow-sm">
                <Icon className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
              </span>
            )}
          </div>
          <p className="font-display text-sm font-semibold tracking-wide text-emerald-700 mb-1">LoanMate</p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
        </div>
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}
